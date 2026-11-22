// Forgot password: an e-mailed 6-digit code lets the owner of a verified account choose a new password.
import { afterEach, describe, expect, it, vi } from "vitest";
import { testApp, post, register, registerVerified, signedInAdmin, member, platformAdmin, login, otpFor, verifyEmailCode, PASSWORD } from "./helpers.js";
import { hashOtp } from "../src/lib/otp.js";
import { passwordChangedEmail, passwordResetEmail } from "../src/lib/mailer.js";
import { OTP_LOCKED_MESSAGE, OTP_THROTTLED_MESSAGE } from "../src/modules/auth/service.js";

let app;
afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
});

const EMAIL = "admin@org.org";
const NEW_PASSWORD = "N3w!Password";
const wrong = (code) => (code === "000000" ? "000001" : "000000");
const sixDigits = (text) => text.match(/(?<!\d)\d{6}(?!\d)/g) ?? [];
const userRow = (email = EMAIL) => app.db("users").where({ email }).first();
const mailsTo = (email) => app.mailer.outbox.filter((m) => m.to === email);
const get = (url, headers) => app.inject({ url, headers });

const forgot = (email = EMAIL) => post(app, "/auth/forgot-password", { email });
const reset = (over = {}) => post(app, "/auth/reset-password", { email: EMAIL, password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD, ...over });
/** Wrong guesses at the reset form: resolves the status codes. */
const guess = async (n, email = EMAIL, code = "000000") => {
  const out = [];
  for (let i = 0; i < n; i++) out.push((await reset({ email, code })).statusCode);
  return out;
};

describe("POST /auth/forgot-password", () => {
  it("e-mails ONE 6-digit code (valid 15 minutes) and the address of the reset page — the e-mail is pre-filled, the code is not in the link", async () => {
    app = await testApp({ env: { FRONTEND_ORIGIN: "https://app.masar.test" } });
    await registerVerified(app);
    const before = app.mailer.outbox.length;
    const res = await forgot();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: expect.any(String), expires_in_minutes: 15, resend_after_seconds: 0 });
    expect(app.mailer.outbox).toHaveLength(before + 1);
    const mail = app.mailer.outbox.at(-1);
    const code = otpFor(app, EMAIL);
    expect(mail).toMatchObject({ to: EMAIL, subject: "رمز إعادة تعيين كلمة المرور - مسار" });
    expect(sixDigits(mail.text)).toEqual([code]); // exactly one 6-digit number
    expect(mail.text).toContain("https://app.masar.test/reset-password?email=admin%40org.org");
    expect(mail.text).toContain("15 دقيقة");
    expect(mail.text).toContain("لا تشارك هذا الرمز");
    expect(mail.html).toContain(code);
    expect(mail.html).toContain('dir="rtl"');
    expect(JSON.stringify(res.json())).not.toContain(code); // never returned by the API
  });

  it("stores only a keyed hash that expires after EMAIL_OTP_TTL_MINUTES", async () => {
    app = await testApp();
    await registerVerified(app);
    await forgot();
    const code = otpFor(app, EMAIL);
    const u = await userRow();
    expect(u.email_otp_hash).toBe(hashOtp(app.config.signingSecret, u.id, code));
    expect(JSON.stringify(u)).not.toContain(code);
    expect(u.email_otp_attempts).toBe(0);
    const ttl = new Date(u.email_otp_expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(14 * 60_000);
    expect(ttl).toBeLessThanOrEqual(15 * 60_000);
  });

  it("answers identically — and mails nothing — for unknown, unverified, invited, inactive and suspended-organization accounts", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    await register(app, { admin_email: "unverified@org.org", organization_name: "U", organization_email: "u@u.org" });
    const invited = await post(app, "/employees", { name: "مدعو", email: "invited@org.org" }, admin.headers);
    expect(invited.statusCode).toBe(201);
    const idle = await member(app, admin, { email: "idle@org.org" });
    await app.db("users").where({ id: idle.userId }).update({ status: "inactive" });
    const other = await signedInAdmin(app, { admin_email: "boss@other.org", organization_name: "B", organization_email: "x@other.org" });
    await app.db("organizations").where({ id: other.organizationId }).update({ status: "suspended" });

    const baseline = (await forgot("ghost@nowhere.org")).json();
    for (const email of ["unverified@org.org", "invited@org.org", "idle@org.org", "boss@other.org"]) {
      const before = mailsTo(email).length;
      const res = await forgot(email);
      expect(res.statusCode, email).toBe(200);
      expect(res.json(), email).toEqual(baseline);
      expect(mailsTo(email), email).toHaveLength(before);
    }
    expect(mailsTo("ghost@nowhere.org")).toHaveLength(0);
    // ...while a real, active account does get its code
    expect((await forgot(admin.email)).statusCode).toBe(200);
    expect(otpFor(app, admin.email)).toMatch(/^[0-9]{6}$/);
  });

  it("works for a platform operator too (their e-mail is verified and they have a password)", async () => {
    app = await testApp();
    await platformAdmin(app);
    await forgot("ops@masar.io");
    const code = otpFor(app, "ops@masar.io");
    expect(code).toMatch(/^[0-9]{6}$/);
    expect((await reset({ email: "ops@masar.io", code })).statusCode).toBe(200);
    expect((await login(app, "ops@masar.io", NEW_PASSWORD)).statusCode).toBe(200);
  });

  it("a new request invalidates the previous code and gives fresh attempts", async () => {
    app = await testApp();
    await registerVerified(app);
    await forgot();
    const first = otpFor(app, EMAIL);
    await reset({ code: wrong(first) }); // one failed attempt
    const before = await userRow();

    await forgot();
    const second = otpFor(app, EMAIL);
    expect((await userRow()).email_otp_hash).not.toBe(before.email_otp_hash);
    expect((await userRow()).email_otp_attempts).toBe(0);
    if (second !== first) expect((await reset({ code: first })).statusCode).toBe(422); // the old code is dead
    expect((await reset({ code: second })).statusCode).toBe(200);
  });

  it("validates the body", async () => {
    app = await testApp();
    expect((await post(app, "/auth/forgot-password", {})).json().errors.email).toBeTruthy();
    expect((await post(app, "/auth/forgot-password", { email: "nope" })).statusCode).toBe(422);
  });

  describe("throttling reveals nothing about accounts", () => {
    it("3 requests per address per 10 minutes — the same for unknown addresses", async () => {
      app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
      await registerVerified(app);
      for (const email of [EMAIL, "ghost@nowhere.org"]) {
        const codes = [];
        for (let i = 0; i < 4; i++) codes.push((await forgot(email)).statusCode);
        expect(codes, email).toEqual([200, 200, 200, 429]);
      }
    });

    it("a cooldown between codes (the same for unknown addresses), with the seconds to wait", async () => {
      app = await testApp({ env: { EMAIL_OTP_RESEND_COOLDOWN_SECONDS: "1" } });
      await registerVerified(app);
      await post(app, "/auth/resend-verification", { email: "x@x.org" }); // unrelated flow: its cooldown is separate
      const bodies = [];
      for (const email of [EMAIL, "ghost@nowhere.org"]) {
        expect((await forgot(email)).statusCode).toBe(200);
        const tooSoon = await forgot(email);
        expect(tooSoon.statusCode).toBe(429);
        expect(tooSoon.json().message).toMatch(/يرجى الانتظار \d+ ثانية/);
        bodies.push(tooSoon.json());
      }
      expect(bodies[0]).toEqual(bodies[1]);
      expect(mailsTo(EMAIL)).toHaveLength(2); // registration code + ONE reset code
      await new Promise((r) => setTimeout(r, 1100));
      expect((await forgot()).statusCode).toBe(200);
    });

    it("per-IP ceiling: 10 requests / 10 minutes", async () => {
      app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
      const codes = [];
      for (let i = 0; i < 12; i++) codes.push((await forgot(`u${i}@x.org`)).statusCode);
      expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
      expect(codes[10]).toBe(429);
    });
  });

  it("prints the code to the server console outside production (development / demo aid), never in production", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    app = await testApp({ env: { LOG_LEVEL: "info" } });
    await registerVerified(app);
    log.mockClear();
    await forgot();
    const printed = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(printed).toContain("password reset code");
    expect(printed).toContain(`code   : ${otpFor(app, EMAIL)}`);
    await app.close();

    log.mockClear();
    app = await testApp({ env: { LOG_LEVEL: "info" }, patch: { isProd: true } });
    await registerVerified(app);
    await forgot();
    expect(log).not.toHaveBeenCalled();
  });
});

describe("POST /auth/reset-password", () => {
  it("chooses the new password: the old one stops working, the new one logs in, the code is single-use, the owner is notified", async () => {
    app = await testApp();
    await registerVerified(app);
    await forgot();
    const code = otpFor(app, EMAIL);

    const res = await reset({ code });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ reset: true, message: "تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة." });
    expect(JSON.stringify(res.json())).not.toContain(NEW_PASSWORD);

    const u = await userRow();
    expect(u.password_hash).toMatch(/^scrypt\$/);
    expect(u.password_hash).not.toContain(NEW_PASSWORD);
    expect(u).toMatchObject({ email_otp_hash: null, email_otp_expires_at: null, email_otp_attempts: 0 });
    expect((await login(app, EMAIL, PASSWORD)).statusCode).toBe(401); // the old password is dead
    expect((await login(app, EMAIL, NEW_PASSWORD)).statusCode).toBe(200);
    expect((await reset({ code, password: "An0ther!Pass", password_confirmation: "An0ther!Pass" })).statusCode).toBe(422); // single use
    expect((await login(app, EMAIL, NEW_PASSWORD)).statusCode).toBe(200);

    const notice = mailsTo(EMAIL).at(-1);
    expect(notice.subject).toBe("تم تغيير كلمة مرور حسابك - مسار");
    expect(sixDigits(notice.text)).toEqual([]); // no code, nothing to act on
    expect(notice.text + notice.html).not.toMatch(/https?:\/\//);
  });

  it("ENDS EVERY SESSION: a token stolen before the reset stops working", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const second = (await login(app, EMAIL)).json().token; // a second device
    expect((await get("/auth/me", admin.headers)).statusCode).toBe(200);

    await forgot();
    expect((await reset({ code: otpFor(app, EMAIL) })).statusCode).toBe(200);

    expect((await get("/auth/me", admin.headers)).statusCode).toBe(401);
    expect((await get("/auth/me", { authorization: `Bearer ${second}` })).statusCode).toBe(401);
    expect(Number((await app.db("auth_tokens").where({ user_id: admin.userId }).count({ n: "*" }).first()).n)).toBe(0);
    const fresh = (await login(app, EMAIL, NEW_PASSWORD)).json().token;
    expect((await get("/auth/me", { authorization: `Bearer ${fresh}` })).statusCode).toBe(200);
  });

  it("other users' sessions are untouched", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const staff = await member(app, admin, { email: "s@org.org" });
    await forgot();
    await reset({ code: otpFor(app, EMAIL) });
    expect((await get("/auth/me", staff.headers)).statusCode).toBe(200);
  });

  it("lifts the failed-login lockout (5 / 15 min) — it must not outlive the reason for it", async () => {
    app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
    await registerVerified(app);
    for (let i = 0; i < 5; i++) expect((await login(app, EMAIL, "wrong")).statusCode).toBe(401);
    expect((await login(app, EMAIL, PASSWORD)).statusCode).toBe(429); // locked, even with the right password

    await forgot();
    expect((await reset({ code: otpFor(app, EMAIL) })).statusCode).toBe(200);
    expect((await login(app, EMAIL, NEW_PASSWORD)).statusCode).toBe(200);
  });

  it("accepts the e-mail in any case and a pasted code with spaces", async () => {
    app = await testApp();
    await registerVerified(app);
    await forgot();
    const code = otpFor(app, EMAIL);
    expect((await reset({ email: " Admin@ORG.org ", code: `${code.slice(0, 3)} ${code.slice(3)}` })).statusCode).toBe(200);
  });

  it("validates the password like registration (422 on `password`) WITHOUT spending an attempt", async () => {
    app = await testApp();
    await registerVerified(app);
    await forgot();
    const code = otpFor(app, EMAIL);
    for (const [password, confirmation] of [["short1!", "short1!"], ["NoDigits!!", "NoDigits!!"], ["NoSymbol123", "NoSymbol123"], [NEW_PASSWORD, "different1!"], [NEW_PASSWORD, undefined]]) {
      const res = await reset({ code, password, password_confirmation: confirmation });
      expect(res.statusCode, password).toBe(422);
      expect(res.json().errors.password).toBeTruthy();
    }
    expect((await userRow()).email_otp_attempts).toBe(0);
    expect((await login(app, EMAIL, PASSWORD)).statusCode).toBe(200); // password untouched
    expect((await reset({ code })).statusCode).toBe(200); // and the code still works
  });

  it.each([["missing", undefined], ["too short", "12345"], ["too long", "1234567"], ["letters", "12a456"], ["null", null]])(
    "validates the code format: %s -> 422 on `code`, not an attempt",
    async (_n, code) => {
      app = await testApp();
      await registerVerified(app);
      await forgot();
      const res = await reset({ code });
      expect(res.statusCode).toBe(422);
      expect(res.json().errors.code).toBeTruthy();
      expect((await userRow()).email_otp_attempts).toBe(0);
    },
  );

  it("validates the e-mail", async () => {
    app = await testApp();
    expect((await reset({ email: "nope", code: "123456" })).json().errors.email).toBeTruthy();
    expect((await post(app, "/auth/reset-password", {})).statusCode).toBe(422);
  });

  it("a wrong code is 422 on `code`, counts as an attempt and changes nothing", async () => {
    app = await testApp();
    await registerVerified(app);
    await forgot();
    const res = await reset({ code: wrong(otpFor(app, EMAIL)) });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ message: "الرمز غير صحيح أو منتهي الصلاحية.", errors: { code: ["الرمز غير صحيح أو منتهي الصلاحية."] } });
    expect((await userRow()).email_otp_attempts).toBe(1);
    expect((await login(app, EMAIL, PASSWORD)).statusCode).toBe(200);
  });

  describe("attempts, expiry and parallel guesses", () => {
    it("five wrong codes kill the code (the sixth call is 429 even with the right one); a new request gives a working code", async () => {
      app = await testApp();
      await registerVerified(app);
      await forgot();
      const good = otpFor(app, EMAIL);
      expect(await guess(5, EMAIL, wrong(good))).toEqual([422, 422, 422, 422, 422]);
      const locked = await reset({ code: good });
      expect(locked.statusCode).toBe(429);
      expect(locked.json().message).toBe(OTP_LOCKED_MESSAGE);
      expect((await userRow()).email_otp_hash).toBeNull();
      expect((await login(app, EMAIL, PASSWORD)).statusCode).toBe(200); // password untouched

      await forgot();
      expect((await reset({ code: otpFor(app, EMAIL) })).statusCode).toBe(200);
    });

    it("the right code still works on the fifth attempt", async () => {
      app = await testApp();
      await registerVerified(app);
      await forgot();
      const good = otpFor(app, EMAIL);
      await guess(4, EMAIL, wrong(good));
      expect((await reset({ code: good })).statusCode).toBe(200);
    });

    it("parallel guesses cannot exceed the limit", async () => {
      app = await testApp();
      await registerVerified(app);
      await forgot();
      const bad = wrong(otpFor(app, EMAIL));
      const statuses = (await Promise.all(Array.from({ length: 15 }, () => reset({ code: bad })))).map((r) => r.statusCode);
      expect(statuses.filter((s) => s === 422).length).toBeLessThanOrEqual(5);
      expect(statuses.every((s) => s === 422 || s === 429)).toBe(true);
      expect((await userRow()).email_otp_attempts).toBeLessThanOrEqual(5);
    });

    it("parallel use of the RIGHT code succeeds exactly once (single use holds under a race)", async () => {
      app = await testApp();
      await registerVerified(app);
      await forgot();
      const code = otpFor(app, EMAIL);
      const results = await Promise.all([reset({ code }), reset({ code, password: "An0ther!Pass", password_confirmation: "An0ther!Pass" })]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 422]);
      const winner = results[0].statusCode === 200 ? NEW_PASSWORD : "An0ther!Pass";
      expect((await login(app, EMAIL, winner)).statusCode).toBe(200);
    });

    it("a correct code is rejected once expired, and discarded", async () => {
      app = await testApp();
      await registerVerified(app);
      await forgot();
      const code = otpFor(app, EMAIL);
      await app.db("users").where({ email: EMAIL }).update({ email_otp_expires_at: new Date(Date.now() - 1000).toISOString() });
      const res = await reset({ code });
      expect(res.statusCode).toBe(422);
      expect(res.json().errors.code[0]).toContain("منتهي الصلاحية");
      expect((await userRow()).email_otp_hash).toBeNull();
      expect((await login(app, EMAIL, PASSWORD)).statusCode).toBe(200);
    });
  });

  describe("a code works only for its own purpose (the account's state decides which kind it is)", () => {
    it("a RESET code cannot verify an e-mail or set a first password", async () => {
      app = await testApp();
      await registerVerified(app);
      await forgot();
      const code = otpFor(app, EMAIL);
      expect((await verifyEmailCode(app, EMAIL, code)).statusCode).toBe(422); // already verified: not a verification code
      expect((await post(app, "/auth/set-password", { email: EMAIL, code, password: "Hack3d!Pass", password_confirmation: "Hack3d!Pass" })).statusCode).toBe(422);
      expect((await login(app, EMAIL, "Hack3d!Pass")).statusCode).toBe(401);
      expect((await login(app, EMAIL, PASSWORD)).statusCode).toBe(200);
      expect((await userRow()).email_otp_attempts).toBe(0); // those calls did not even touch the code
      expect((await reset({ code })).statusCode).toBe(200); // and it still resets
    });

    it("a VERIFICATION code cannot reset a password (the account is not verified yet)", async () => {
      app = await testApp();
      await register(app);
      const code = otpFor(app, EMAIL);
      expect((await reset({ code })).statusCode).toBe(422);
      expect((await login(app, EMAIL, NEW_PASSWORD)).statusCode).toBe(401);
      expect((await login(app, EMAIL, PASSWORD)).statusCode).toBe(403); // old password intact: only "verify your e-mail"
      expect((await verifyEmailCode(app, EMAIL, code)).statusCode).toBe(200); // the code was not burnt
    });

    it("an INVITATION code cannot reset a password (the employee has none yet) and is not burnt by trying", async () => {
      app = await testApp();
      const admin = await signedInAdmin(app);
      await post(app, "/employees", { name: "مدعو", email: "invited@org.org" }, admin.headers);
      const code = otpFor(app, "invited@org.org");
      expect((await reset({ email: "invited@org.org", code })).statusCode).toBe(422);
      expect((await login(app, "invited@org.org", NEW_PASSWORD)).statusCode).toBe(401);
      expect((await post(app, "/auth/set-password", { email: "invited@org.org", code, password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD })).statusCode).toBe(200);
    });

    it("changing the e-mail meanwhile replaces the reset code with a verification code: the old reset code is dead", async () => {
      app = await testApp();
      const admin = await signedInAdmin(app);
      const staff = await member(app, admin, { email: "s@org.org", name: "S" });
      await forgot("s@org.org");
      const resetCode = otpFor(app, "s@org.org");
      await app.inject({ method: "PUT", url: `/employees/${staff.userId}`, payload: { email: "s-new@org.org" }, headers: admin.headers });
      expect((await reset({ email: "s@org.org", code: resetCode })).statusCode).toBe(422);
      expect((await reset({ email: "s-new@org.org", code: resetCode })).statusCode).toBe(422);
    });
  });

  describe("no account enumeration", () => {
    it("unknown, unverified, invited and 'never asked' addresses behave identically: five 422, then the same 429", async () => {
      app = await testApp();
      const admin = await signedInAdmin(app);
      await register(app, { admin_email: "unverified@org.org", organization_name: "U", organization_email: "u@u.org" });
      await post(app, "/employees", { name: "مدعو", email: "invited@org.org" }, admin.headers);
      const expected = [422, 422, 422, 422, 422, 429];
      const bodies = [];
      for (const email of ["ghost@nowhere.org", "unverified@org.org", "invited@org.org", admin.email]) {
        app.limiter.clear();
        const seq = await guess(6, email, "123456");
        expect(seq, email).toEqual(expected);
        bodies.push((await reset({ email, code: "123456" })).json());
      }
      expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1); // the very same text
    });

    it("a real account with a live code answers the 6th guess exactly like an unknown address (status AND text)", async () => {
      app = await testApp();
      await registerVerified(app);
      await forgot();
      const good = otpFor(app, EMAIL);
      await guess(5, EMAIL, wrong(good));
      const known = await reset({ code: good });
      const unknown = await (async () => {
        await guess(5, "ghost@nowhere.org", "123456");
        return reset({ email: "ghost@nowhere.org", code: "123456" });
      })();
      expect(known.statusCode).toBe(429);
      expect(unknown.statusCode).toBe(429);
      expect(known.json()).toEqual(unknown.json());
    });

    it("asking for a new code gives fresh attempts to known AND unknown addresses alike (no 'still locked' oracle)", async () => {
      app = await testApp();
      await registerVerified(app);
      const after = {};
      for (const email of [EMAIL, "ghost@nowhere.org"]) {
        await forgot(email);
        const good = otpFor(app, email) ?? "123456";
        await guess(5, email, wrong(good)); // use up the attempts
        expect((await reset({ email, code: wrong(good) })).statusCode).toBe(429); // locked
        await forgot(email); // a new code is requested
        after[email] = (await reset({ email, code: wrong(good) })).statusCode;
      }
      expect(after[EMAIL]).toBe(422);
      expect(after["ghost@nowhere.org"]).toBe(422); // not 429
    });

    it("the same goes for the verification flow's resend (an existing oracle, closed here)", async () => {
      app = await testApp();
      await register(app);
      const sequence = async (email, good) => {
        await post(app, "/auth/resend-verification", { email });
        for (let i = 0; i < 5; i++) await verifyEmailCode(app, email, wrong(good));
        expect((await verifyEmailCode(app, email, wrong(good))).statusCode).toBe(429);
        await post(app, "/auth/resend-verification", { email });
        return (await verifyEmailCode(app, email, wrong(good))).statusCode;
      };
      expect(await sequence(EMAIL, otpFor(app, EMAIL))).toBe(422);
      expect(await sequence("ghost@nowhere.org", "123456")).toBe(422);
    });
  });

  describe("hourly cap on wrong guesses, summed over every code (a new code must not mean endless guessing)", () => {
    it("10 wrong guesses in an hour block the address — even the right code — with one fixed message", async () => {
      app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
      await registerVerified(app);
      let good;
      for (const failures of [4, 4, 2]) {
        await forgot();
        good = otpFor(app, EMAIL);
        expect(await guess(failures, EMAIL, wrong(good))).toEqual(Array(failures).fill(422));
      }
      const blocked = await reset({ code: good }); // the current code is right and alive: still refused
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().message).toBe(OTP_THROTTLED_MESSAGE);
      expect((await login(app, EMAIL, PASSWORD)).statusCode).toBe(200); // password untouched
    });

    it("an unknown address hits the same wall at the same point with the same text", async () => {
      app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
      await registerVerified(app);
      const run = async (email) => {
        for (const failures of [4, 4, 2]) {
          await forgot(email);
          await guess(failures, email, "123456");
        }
        return reset({ email, code: "123456" });
      };
      const known = await run(EMAIL);
      const unknown = await run("ghost@nowhere.org");
      expect(known.statusCode).toBe(429);
      expect(unknown.json()).toEqual(known.json());
      expect(unknown.json().message).toBe(OTP_THROTTLED_MESSAGE);
    });

    it("while capped, forgot-password mails nothing (same 200 as ever)", async () => {
      app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
      await registerVerified(app);
      await forgot();
      await guess(5, EMAIL, wrong(otpFor(app, EMAIL))); // 5 failures
      await forgot();
      await guess(5, EMAIL, wrong(otpFor(app, EMAIL))); // 10 failures
      const mails = mailsTo(EMAIL).length;
      const res = await forgot();
      expect(res.statusCode).toBe(200);
      expect(mailsTo(EMAIL)).toHaveLength(mails);
    });

    it("failures are counted per address: another account is unaffected", async () => {
      app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
      const admin = await signedInAdmin(app);
      const staff = await member(app, admin, { email: "s@org.org" });
      for (const failures of [5, 5]) {
        await forgot();
        await guess(failures, EMAIL, wrong(otpFor(app, EMAIL)));
      }
      await forgot("s@org.org");
      expect((await reset({ email: "s@org.org", code: otpFor(app, "s@org.org") })).statusCode).toBe(200);
      void staff;
    });
  });

  it("per-IP ceiling: 30 attempts / 10 minutes", async () => {
    app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
    const codes = [];
    for (let i = 0; i < 32; i++) codes.push((await reset({ email: `u${i}@x.org`, code: "123456" })).statusCode);
    expect(codes.slice(0, 30).every((c) => c === 422)).toBe(true);
    expect(codes[30]).toBe(429);
  });
});

describe("e-mail templates", () => {
  it("escape names and carry no markup injection", () => {
    const { html } = passwordResetEmail({ name: "<img onerror=x>", code: "123456", ttlMinutes: 15, resetUrl: 'https://x/"><script>' });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(passwordChangedEmail({ name: "<b>x</b>" }).html).not.toContain("<b>x</b>");
  });
});
