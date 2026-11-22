// Employee invitation: an admin adds an employee -> a code is e-mailed -> the employee chooses a password on /set-password.
import { afterEach, describe, expect, it, vi } from "vitest";
import { testApp, post, register, registerVerified, signedInAdmin, member, login, otpFor, verifyEmailCode, PASSWORD } from "./helpers.js";
import { hashOtp } from "../src/lib/otp.js";
import { inviteEmail } from "../src/lib/mailer.js";

let app;
afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
});

const NEW_PASSWORD = "N3w!Password";
const EMAIL = "jalal@org.org";
const wrongCode = (code) => (code === "000000" ? "000001" : "000000");
const send = (method, url, payload, headers) => app.inject({ method, url, payload, headers });
const userRow = (email = EMAIL) => app.db("users").where({ email }).first();
const setPassword = (over = {}) => post(app, "/auth/set-password", { email: EMAIL, password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD, ...over });
const sixDigits = (text) => text.match(/(?<!\d)\d{6}(?!\d)/g) ?? [];

/** Admin adds an employee through the API; resolves the new employee and the code that was e-mailed to them. */
async function invited(admin, over = {}) {
  const res = await send("POST", "/employees", { name: "جلال العمر", email: EMAIL, status: "active", ...over }, admin.headers);
  expect(res.statusCode).toBe(201);
  return { employee: res.json().data, code: otpFor(app, over.email ?? EMAIL) };
}

describe("POST /employees sends the invitation", () => {
  it("mails one 6-digit code (valid 48 hours) and the address of the set-password page; the e-mail address is pre-filled, the code is not in the link", async () => {
    app = await testApp({ env: { FRONTEND_ORIGIN: "https://app.masar.test" } });
    const admin = await signedInAdmin(app);
    const before = app.mailer.outbox.length;
    const { employee, code } = await invited(admin);

    expect(app.mailer.outbox).toHaveLength(before + 1);
    const mail = app.mailer.outbox.at(-1);
    expect(mail.to).toBe(EMAIL);
    expect(mail.subject).toBe("دعوة للانضمام إلى منظمة النور - مسار");
    expect(sixDigits(mail.text)).toEqual([code]); // exactly one 6-digit number
    expect(mail.text).toContain("https://app.masar.test/set-password?email=jalal%40org.org");
    expect(mail.text).toContain("يومين");
    expect(mail.text).toContain("منظمة النور");
    expect(mail.text).toContain("لا تشارك هذا الرمز");
    expect(mail.html).toContain(code);
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.text.replace(code, "")).not.toContain(code); // the code is not repeated inside the link
    expect(employee).toMatchObject({ can_login: false, invite_pending: true });
    expect(JSON.stringify(employee)).not.toContain(code); // the API never returns the code
  });

  it("stores only a keyed hash that expires after INVITE_TTL_HOURS", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { code } = await invited(admin);
    const u = await userRow();
    expect(u.email_otp_hash).toBe(hashOtp(app.config.signingSecret, u.id, code));
    expect(JSON.stringify(u)).not.toContain(code);
    expect(u.email_otp_attempts).toBe(0);
    const ttl = new Date(u.email_otp_expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(47 * 3_600_000);
    expect(ttl).toBeLessThanOrEqual(48 * 3_600_000);
  });

  it("the lifetime is configurable and described in the mail", async () => {
    app = await testApp({ env: { INVITE_TTL_HOURS: "72" } });
    const admin = await signedInAdmin(app);
    await invited(admin);
    expect(app.mailer.outbox.at(-1).text).toContain("3 أيام");
    const ttl = new Date((await userRow()).email_otp_expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(71 * 3_600_000);

    expect(inviteEmail({ name: "x", organizationName: "o", code: "123456", ttlHours: 24, setPasswordUrl: "u" }).text).toContain("يوم واحد");
    expect(inviteEmail({ name: "x", organizationName: "o", code: "123456", ttlHours: 5, setPasswordUrl: "u" }).text).toContain("5 ساعة");
  });

  it("escapes names in the HTML part", () => {
    const { html } = inviteEmail({ name: "<img onerror=x>", organizationName: "A&B", code: "123456", ttlHours: 48, setPasswordUrl: 'https://x/"><script>' });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("A&amp;B");
  });

  it("an inactive employee is not invited (nothing to activate yet); no mail failure can fail the request", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const before = app.mailer.outbox.length;
    const res = await send("POST", "/employees", { name: "غير نشط", email: "idle@org.org", status: "inactive" }, admin.headers);
    expect(res.statusCode).toBe(201);
    expect(app.mailer.outbox).toHaveLength(before);
    expect((await userRow("idle@org.org")).email_otp_hash).toBeNull();

    vi.spyOn(app.mailer, "sendSafe").mockImplementation(() => Promise.reject(new Error("smtp down")).catch(() => {}));
    expect((await send("POST", "/employees", { name: "ب", email: "b@org.org" }, admin.headers)).statusCode).toBe(201);
  });

  it("activating an employee who was added as inactive sends the invitation then (once)", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const idle = (await send("POST", "/employees", { name: "غير نشط", email: "idle@org.org", status: "inactive" }, admin.headers)).json().data;
    const before = app.mailer.outbox.length;

    // an edit that does not activate sends nothing
    expect((await send("PUT", `/employees/${idle.id}`, { name: "غير نشط 2" }, admin.headers)).statusCode).toBe(200);
    expect(app.mailer.outbox).toHaveLength(before);

    expect((await send("PUT", `/employees/${idle.id}`, { status: "active" }, admin.headers)).statusCode).toBe(200);
    expect(app.mailer.outbox).toHaveLength(before + 1);
    expect(app.mailer.outbox.at(-1).to).toBe("idle@org.org");
    expect(sixDigits(app.mailer.outbox.at(-1).text)).toEqual([otpFor(app, "idle@org.org")]);

    // already active: saving again does not re-invite
    expect((await send("PUT", `/employees/${idle.id}`, { status: "active" }, admin.headers)).statusCode).toBe(200);
    expect(app.mailer.outbox).toHaveLength(before + 1);
  });

  it("prints the code to the server console outside production (development / demo aid)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    app = await testApp({ env: { LOG_LEVEL: "info" } });
    const admin = await signedInAdmin(app);
    const { code } = await invited(admin);
    const printed = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(printed).toContain("employee invitation code");
    expect(printed).toContain(`code   : ${code}`);
    expect(printed).toContain("48 hours");
  });
});

describe("POST /auth/set-password", () => {
  it("activates the account: password set, e-mail verified, code spent, login works; the code is single-use", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { code } = await invited(admin);
    expect((await login(app, EMAIL, NEW_PASSWORD)).statusCode).toBe(401); // no password yet

    const res = await setPassword({ code });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ activated: true, message: "تم تفعيل حسابك. يمكنك الآن تسجيل الدخول." });
    expect(JSON.stringify(res.json())).not.toContain(NEW_PASSWORD);

    const u = await userRow();
    expect(u.password_hash).toMatch(/^scrypt\$/);
    expect(u.password_hash).not.toContain(NEW_PASSWORD);
    expect(new Date(u.email_verified_at).toISOString()).toMatch(/Z$/);
    expect(u).toMatchObject({ email_otp_hash: null, email_otp_expires_at: null, email_otp_attempts: 0 });

    const signedIn = await login(app, EMAIL, NEW_PASSWORD);
    expect(signedIn.statusCode).toBe(200);
    expect(signedIn.json().user).toMatchObject({ email: EMAIL });
    const listed = (await send("GET", "/employees", undefined, admin.headers)).json().data.find((e) => e.email === EMAIL);
    expect(listed).toMatchObject({ can_login: true, invite_pending: false });

    expect((await setPassword({ code, password: "An0ther!Pass", password_confirmation: "An0ther!Pass" })).statusCode).toBe(422); // single use
    expect((await login(app, EMAIL, NEW_PASSWORD)).statusCode).toBe(200); // password unchanged
  });

  it("the invited employee gets the permissions of their role and the organization's tenant", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const role = (await send("POST", "/roles", { title: "باحث", permissions: ["tasks.view"] }, admin.headers)).json().data;
    const { code } = await invited(admin, { role_id: role.id });
    await setPassword({ code });
    const token = (await login(app, EMAIL, NEW_PASSWORD)).json().token;
    const me = await send("GET", "/auth/me", undefined, { authorization: `Bearer ${token}` });
    expect(me.json().user).toMatchObject({ role: "باحث", permissions: ["tasks.view"] });
    expect(me.json().organization).toMatchObject({ id: admin.organizationId });
  });

  it("accepts the e-mail in any case and a pasted code with spaces", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { code } = await invited(admin);
    expect((await setPassword({ email: " Jalal@ORG.org ", code: `${code.slice(0, 3)} ${code.slice(3)}` })).statusCode).toBe(200);
  });

  it("validates the password like registration (422 on `password`) WITHOUT spending an attempt", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { code } = await invited(admin);
    for (const [password, confirmation] of [["short1!", "short1!"], ["NoDigits!!", "NoDigits!!"], ["NoSymbol123", "NoSymbol123"], [NEW_PASSWORD, "different1!"], [NEW_PASSWORD, undefined]]) {
      const res = await setPassword({ code, password, password_confirmation: confirmation });
      expect(res.statusCode, password).toBe(422);
      expect(res.json().errors.password).toBeTruthy();
    }
    expect((await userRow()).email_otp_attempts).toBe(0);
    expect((await setPassword({ code })).statusCode).toBe(200); // the code still works
  });

  it.each([["missing", undefined], ["too short", "12345"], ["too long", "1234567"], ["letters", "12a456"], ["null", null]])(
    "validates the code format: %s -> 422 on `code`, not an attempt",
    async (_n, code) => {
      app = await testApp();
      const admin = await signedInAdmin(app);
      await invited(admin);
      const res = await setPassword({ code });
      expect(res.statusCode).toBe(422);
      expect(res.json().errors.code).toBeTruthy();
      expect((await userRow()).email_otp_attempts).toBe(0);
    },
  );

  it("validates the e-mail", async () => {
    app = await testApp();
    expect((await setPassword({ email: "nope", code: "123456" })).json().errors.email).toBeTruthy();
    expect((await post(app, "/auth/set-password", {})).statusCode).toBe(422);
  });

  it("a wrong code is 422 with the field error, counts as an attempt and sets nothing", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { code } = await invited(admin);
    const res = await setPassword({ code: wrongCode(code) });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ message: "الرمز غير صحيح أو منتهي الصلاحية.", errors: { code: ["الرمز غير صحيح أو منتهي الصلاحية."] } });
    const u = await userRow();
    expect(u.email_otp_attempts).toBe(1);
    expect(u.password_hash).toBeNull();
    expect(u.email_verified_at).toBeNull();
  });

  describe("attempt limit and expiry", () => {
    it("five wrong codes are 422; the sixth call — even with the right code — is 429 until an admin re-sends the invitation", async () => {
      app = await testApp();
      const admin = await signedInAdmin(app);
      const { employee, code } = await invited(admin);
      for (let i = 1; i <= 5; i++) expect((await setPassword({ code: wrongCode(code) })).statusCode, `attempt ${i}`).toBe(422);

      const locked = await setPassword({ code });
      expect(locked.statusCode).toBe(429);
      expect(locked.json().message).toContain("اطلب رمزاً جديداً");
      expect((await userRow()).email_otp_hash).toBeNull(); // the code died with the fifth failure
      expect((await userRow()).password_hash).toBeNull();

      expect((await send("POST", `/employees/${employee.id}/invite`, undefined, admin.headers)).statusCode).toBe(200);
      expect((await setPassword({ code: otpFor(app, EMAIL) })).statusCode).toBe(200);
    });

    it("parallel guesses cannot exceed the limit", async () => {
      app = await testApp();
      const admin = await signedInAdmin(app);
      const { code } = await invited(admin);
      const results = await Promise.all(Array.from({ length: 15 }, () => setPassword({ code: wrongCode(code) })));
      const statuses = results.map((r) => r.statusCode);
      expect(statuses.filter((s) => s === 422).length).toBeLessThanOrEqual(5);
      expect(statuses.every((s) => s === 422 || s === 429)).toBe(true);
      expect((await userRow()).email_otp_attempts).toBeLessThanOrEqual(5);
    });

    it("a correct code is rejected once expired, and discarded", async () => {
      app = await testApp();
      const admin = await signedInAdmin(app);
      const { code } = await invited(admin);
      await app.db("users").where({ email: EMAIL }).update({ email_otp_expires_at: new Date(Date.now() - 1000).toISOString() });
      const res = await setPassword({ code });
      expect(res.statusCode).toBe(422);
      expect(res.json().errors.code[0]).toContain("منتهي الصلاحية");
      expect((await userRow()).password_hash).toBeNull();
      expect((await userRow()).email_otp_hash).toBeNull();
    });

    it("is still valid a minute before it expires, and a day-old invitation works", async () => {
      app = await testApp();
      const admin = await signedInAdmin(app);
      const { code } = await invited(admin);
      await app.db("users").where({ email: EMAIL }).update({ email_otp_expires_at: new Date(Date.now() + 60_000).toISOString(), email_otp_sent_at: new Date(Date.now() - 86_400_000).toISOString() });
      expect((await setPassword({ code })).statusCode).toBe(200);
    });
  });

  describe("only an invitation can be redeemed here (no account takeover, no enumeration)", () => {
    it("an account that already has a password cannot be reset with a code: 422, password untouched", async () => {
      app = await testApp();
      // a registered admin: has a password and an active verification code
      await register(app);
      const code = otpFor(app, "admin@org.org");
      const res = await setPassword({ email: "admin@org.org", code, password: "Hack3d!Pass", password_confirmation: "Hack3d!Pass" });
      expect(res.statusCode).toBe(422);
      expect((await login(app, "admin@org.org", "Hack3d!Pass")).statusCode).toBe(401);
      expect((await login(app, "admin@org.org", PASSWORD)).statusCode).toBe(403); // still just "verify your e-mail"
      expect((await verifyEmailCode(app, "admin@org.org", code)).statusCode).toBe(200); // and the code still verifies
    });

    it("a verified user with a password cannot use it either", async () => {
      app = await testApp();
      await registerVerified(app);
      expect((await setPassword({ email: "admin@org.org", code: "123456" })).statusCode).toBe(422);
      expect((await login(app, "admin@org.org", PASSWORD)).statusCode).toBe(200);
    });

    it("unknown, activated and verified addresses behave identically: five 422, then 429, with the same text", async () => {
      app = await testApp();
      const admin = await signedInAdmin(app);
      const { code } = await invited(admin);
      await setPassword({ code }); // jalal is now activated
      const sequence = async (email) => {
        const out = [];
        for (let i = 0; i < 6; i++) out.push((await setPassword({ email, code: "123456" })).statusCode);
        return out;
      };
      const expected = [422, 422, 422, 422, 422, 429];
      expect(await sequence("ghost@nowhere.org")).toEqual(expected);
      expect(await sequence(EMAIL)).toEqual(expected);
      expect(await sequence("admin@org.org")).toEqual(expected);
      app.limiter.clear();
      const a = await setPassword({ email: "ghost2@nowhere.org", code: "123456" });
      app.limiter.clear();
      const b = await setPassword({ email: EMAIL, code: "123456" });
      expect(a.json()).toEqual(b.json());
    });

    it("hammering the verification endpoint for an invited address neither burns nor locks the invitation", async () => {
      app = await testApp();
      const admin = await signedInAdmin(app);
      const { code } = await invited(admin);
      for (let i = 0; i < 8; i++) await verifyEmailCode(app, EMAIL, code); // the right code, wrong endpoint
      const u = await userRow();
      expect(u.email_otp_attempts).toBe(0);
      expect(u.email_otp_hash).not.toBeNull();
      expect(u.email_verified_at).toBeNull();
      expect((await setPassword({ code })).statusCode).toBe(200);
    });

    it("the per-IP ceiling applies", async () => {
      app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
      const codes = [];
      for (let i = 0; i < 32; i++) codes.push((await setPassword({ email: `u${i}@x.org`, code: "123456" })).statusCode);
      expect(codes.slice(0, 30).every((c) => c === 422)).toBe(true);
      expect(codes[30]).toBe(429);
    });
  });
});

describe("the public resend does not serve invitations", () => {
  it("answers 200 like for any address but mails nothing and keeps the invitation code alive", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { code } = await invited(admin);
    const before = app.mailer.outbox.length;
    const hashBefore = (await userRow()).email_otp_hash;

    const res = await post(app, "/auth/resend-verification", { email: EMAIL });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe((await post(app, "/auth/resend-verification", { email: "ghost@x.org" })).json().message);
    expect(app.mailer.outbox).toHaveLength(before);
    expect((await userRow()).email_otp_hash).toBe(hashBefore);
    expect((await setPassword({ code })).statusCode).toBe(200);
  });
});

describe("POST /employees/:id/invite (admin re-sends the invitation)", () => {
  it("issues a fresh code: the previous one dies, attempts and expiry restart, the new one works", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { employee, code: first } = await invited(admin);
    await setPassword({ code: wrongCode(first) }); // one failed attempt on the first code
    const before = await userRow();
    const mails = app.mailer.outbox.length;

    const res = await send("POST", `/employees/${employee.id}/invite`, undefined, admin.headers);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: "تم إرسال دعوة جديدة إلى بريد الموظف.", expires_in_hours: 48 });
    expect(app.mailer.outbox).toHaveLength(mails + 1);
    expect(app.mailer.outbox.at(-1)).toMatchObject({ to: EMAIL });
    expect(JSON.stringify(res.json())).not.toMatch(/\d{6}/);

    const second = otpFor(app, EMAIL);
    const after = await userRow();
    expect(after.email_otp_hash).not.toBe(before.email_otp_hash);
    expect(after.email_otp_attempts).toBe(0);
    if (second !== first) expect((await setPassword({ code: first })).statusCode).toBe(422); // the old invitation is dead
    expect((await setPassword({ code: second })).statusCode).toBe(200);
  });

  it("409 once the employee has activated their account (nothing is mailed); 409 while they are inactive", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { employee, code } = await invited(admin);
    await setPassword({ code });
    const mails = app.mailer.outbox.length;
    const done = await send("POST", `/employees/${employee.id}/invite`, undefined, admin.headers);
    expect(done.statusCode).toBe(409);
    expect(done.json().message).toContain("فعّل حسابه");
    expect(app.mailer.outbox).toHaveLength(mails);

    const idle = (await send("POST", "/employees", { name: "ك", email: "idle@org.org", status: "inactive" }, admin.headers)).json().data;
    expect((await send("POST", `/employees/${idle.id}/invite`, undefined, admin.headers)).statusCode).toBe(409);
    expect(app.mailer.outbox).toHaveLength(mails);
    // activating them and inviting works
    await send("PUT", `/employees/${idle.id}`, { status: "active" }, admin.headers);
    expect((await send("POST", `/employees/${idle.id}/invite`, undefined, admin.headers)).statusCode).toBe(200);
    expect(app.mailer.outbox.at(-1)).toMatchObject({ to: "idle@org.org" });
  });

  it("needs employees.manage; 401 without a session; 404 for unknown ids, other organizations and junk", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const other = await signedInAdmin(app, { admin_email: "boss@other.org", organization_name: "B", organization_email: "x@other.org" });
    const { employee } = await invited(admin);
    const viewer = await member(app, admin, { email: "v@org.org", permissions: ["employees.view"] });

    expect((await send("POST", `/employees/${employee.id}/invite`, undefined, viewer.headers)).statusCode).toBe(403);
    expect((await send("POST", `/employees/${employee.id}/invite`)).statusCode).toBe(401);
    expect((await send("POST", `/employees/${employee.id}/invite`, undefined, other.headers)).statusCode).toBe(404); // tenant isolation
    expect((await send("POST", "/employees/99999/invite", undefined, admin.headers)).statusCode).toBe(404);
    expect((await send("POST", "/employees/abc/invite", undefined, admin.headers)).statusCode).toBe(404);
  });

  it("a non-admin manager cannot touch a more powerful employee", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const manager = await member(app, admin, { email: "m@org.org", permissions: ["employees.manage", "employees.view"] });
    const adminRoleId = (await app.db("users").where({ id: admin.userId }).first()).role_id;
    await app.db("users").insert({ organization_id: admin.organizationId, role_id: adminRoleId, name: "مدير ثانٍ", email: "boss2@org.org" }); // pending system admin
    const target = await userRow("boss2@org.org");
    expect((await send("POST", `/employees/${target.id}/invite`, undefined, manager.headers)).statusCode).toBe(403);
  });

  it("is throttled: 5 invitations per employee per 10 minutes", async () => {
    app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
    const admin = await signedInAdmin(app);
    const { employee } = await invited(admin);
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await send("POST", `/employees/${employee.id}/invite`, undefined, admin.headers)).statusCode);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});

describe("changing a pending employee's e-mail", () => {
  it("re-invites the NEW address; the old invitation code can no longer be used", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { employee, code: oldCode } = await invited(admin);
    const res = await send("PUT", `/employees/${employee.id}`, { email: "jalal.new@org.org" }, admin.headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ email: "jalal.new@org.org", invite_pending: true });

    const mail = app.mailer.outbox.at(-1);
    expect(mail.to).toBe("jalal.new@org.org");
    expect(mail.text).toContain("jalal.new%40org.org");
    const fresh = otpFor(app, "jalal.new@org.org");
    expect((await setPassword({ email: EMAIL, code: oldCode })).statusCode).toBe(422); // the old address is gone
    expect((await setPassword({ email: "jalal.new@org.org", code: fresh })).statusCode).toBe(200);
    expect((await login(app, "jalal.new@org.org", NEW_PASSWORD)).statusCode).toBe(200);
  });
});
