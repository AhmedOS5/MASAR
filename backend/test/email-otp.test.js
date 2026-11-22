import { afterEach, describe, expect, it, vi } from "vitest";
import { testApp, testEnv, post, register, registerVerified, signedInAdmin, member, login, bearer, otpFor, verifyEmailCode, registrationBody, PASSWORD } from "./helpers.js";
import { createHash } from "node:crypto";
import { generateOtp, hashOtp, otpMatches, OTP_LENGTH } from "../src/lib/otp.js";
import { createMailer, otpEmail } from "../src/lib/mailer.js";
import { loadEnv } from "../src/config/env.js";

let app;
afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
});

const EMAIL = "admin@org.org";
const wrongCode = (code) => (code === "000000" ? "000001" : "000000");
const userRow = () => app.db("users").where({ email: EMAIL }).first();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (method, url, payload, headers) => app.inject({ method, url, payload, headers });

describe("OTP primitives", () => {
  it("generates zero-padded 6-digit codes from the CSPRNG", () => {
    const codes = Array.from({ length: 3000 }, generateOtp);
    expect(OTP_LENGTH).toBe(6);
    expect(codes.every((c) => /^[0-9]{6}$/.test(c))).toBe(true);
    expect(codes.some((c) => c.startsWith("0"))).toBe(true); // leading zeros are kept ("004217")
    expect(new Set(codes).size).toBeGreaterThan(2900); // not a constant / tiny range
  });

  it("hashes with a server key: not the plain code, not a bare SHA-256, bound to the user and the secret", () => {
    const h = hashOtp("secret-a", 7, "123456");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("123456");
    expect(h).not.toBe(createHash("sha256").update("123456").digest("hex"));
    expect(hashOtp("secret-a", 7, "123456")).toBe(h);
    expect(hashOtp("secret-b", 7, "123456")).not.toBe(h);
    expect(hashOtp("secret-a", 8, "123456")).not.toBe(h);
  });

  it("compares in constant time and rejects wrong/odd values", () => {
    const h = hashOtp("s", 1, "123456");
    expect(otpMatches("s", 1, "123456", h)).toBe(true);
    expect(otpMatches("s", 1, "123457", h)).toBe(false);
    expect(otpMatches("s", 2, "123456", h)).toBe(false);
    expect(otpMatches("s", 1, "123456", null)).toBe(false);
    expect(otpMatches("s", 1, "123456", "not-hex")).toBe(false);
    expect(otpMatches("s", 1, "123456", "")).toBe(false);
  });
});

describe("registration issues a code", () => {
  it("stores only a keyed hash with a 15-minute expiry — the code appears nowhere in the database", async () => {
    app = await testApp();
    expect((await register(app)).statusCode).toBe(201);
    const code = otpFor(app, EMAIL);
    const u = await userRow();
    expect(u.email_otp_hash).toBe(hashOtp(app.config.signingSecret, u.id, code));
    expect(JSON.stringify(u)).not.toContain(code);
    expect(u.email_otp_attempts).toBe(0);
    const ttl = new Date(u.email_otp_expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(14 * 60_000);
    expect(ttl).toBeLessThanOrEqual(15 * 60_000);
    expect(u.email_otp_sent_at).toBeTruthy();
  });

  it("e-mails a clean Arabic message with the code once, the validity and a safety note", async () => {
    app = await testApp({ env: { SMTP_FROM: "MASAR <noreply@masar.test>" } });
    await register(app);
    const mail = app.mailer.outbox[0];
    const code = otpFor(app, EMAIL);
    expect(mail).toMatchObject({ to: EMAIL, from: "MASAR <noreply@masar.test>", subject: "رمز التحقق من بريدك الإلكتروني - مسار" });
    expect(mail.text.split(code)).toHaveLength(2); // exactly one occurrence
    expect(mail.text).toContain("15 دقيقة");
    expect(mail.text).toContain("لا تشارك هذا الرمز");
    expect(mail.text).toContain("منظمة النور");
    expect(mail.html).toContain(code);
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.text + mail.html).not.toMatch(/https?:\/\//); // no link: the code is the whole mechanism
  });

  it("escapes names in the HTML part", () => {
    const { html } = otpEmail({ name: "<img onerror=x>", organizationName: "A&B", code: "123456", ttlMinutes: 15 });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("A&amp;B");
  });

  it("the old signed-link endpoints no longer exist", async () => {
    app = await testApp();
    expect((await app.inject({ url: "/email/verify/1/abc?expires=1&signature=x" })).statusCode).toBe(404);
    expect((await app.inject({ url: "/email/verification-status?email=a@b.org" })).statusCode).toBe(404);
    expect((await send("POST", "/email/resend-verification", { email: EMAIL })).statusCode).toBe(404);
  });
});

describe("POST /auth/verify-email", () => {
  it("verifies with the right code, clears it, and lets the user log in; the code is single-use", async () => {
    app = await testApp();
    await register(app);
    expect((await login(app)).statusCode).toBe(403); // not verified yet
    const code = otpFor(app, EMAIL);

    const ok = await verifyEmailCode(app, EMAIL, code);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ verified: true, message: "تم تفعيل البريد بنجاح." });
    const u = await userRow();
    expect(new Date(u.email_verified_at).toISOString()).toMatch(/Z$/);
    expect(u).toMatchObject({ email_otp_hash: null, email_otp_expires_at: null, email_otp_attempts: 0 });
    expect((await login(app)).statusCode).toBe(200);

    const again = await verifyEmailCode(app, EMAIL, code);
    expect(again.statusCode).toBe(422);
  });

  it("accepts the e-mail in any case, a pasted code with spaces, and a JSON number (zero-padded)", async () => {
    app = await testApp();
    await register(app);
    let code = otpFor(app, EMAIL);
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect((await verifyEmailCode(app, " Admin@ORG.org ", spaced)).statusCode).toBe(200);

    // a code with leading zeros sent as a JSON number
    await register(app, { admin_email: "z@org.org", organization_name: "Z" });
    const u = await app.db("users").where({ email: "z@org.org" }).first();
    const h = hashOtp(app.config.signingSecret, u.id, "004217");
    await app.db("users").where({ id: u.id }).update({ email_otp_hash: h });
    expect((await send("POST", "/auth/verify-email", { email: "z@org.org", code: 4217 })).statusCode).toBe(200);
  });

  it("a wrong code is 422 with the field error and counts as an attempt", async () => {
    app = await testApp();
    await register(app);
    const res = await verifyEmailCode(app, EMAIL, wrongCode(otpFor(app, EMAIL)));
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ message: "الرمز غير صحيح أو منتهي الصلاحية.", errors: { code: ["الرمز غير صحيح أو منتهي الصلاحية."] } });
    expect((await userRow()).email_otp_attempts).toBe(1);
    expect((await userRow()).email_verified_at).toBeNull();
  });

  it.each([
    ["missing", undefined],
    ["too short", "12345"],
    ["too long", "1234567"],
    ["letters", "12a456"],
    ["empty", ""],
    ["null", null],
  ])("validates the code format: %s -> 422 on `code`", async (_n, code) => {
    app = await testApp();
    await register(app);
    const res = await send("POST", "/auth/verify-email", { email: EMAIL, code });
    expect(res.statusCode).toBe(422);
    expect(res.json().errors.code).toBeTruthy();
    expect((await userRow()).email_otp_attempts).toBe(0); // format errors are not attempts
  });

  it("validates the e-mail", async () => {
    app = await testApp();
    expect((await send("POST", "/auth/verify-email", { email: "nope", code: "123456" })).json().errors.email).toBeTruthy();
    expect((await send("POST", "/auth/verify-email", {})).statusCode).toBe(422);
  });

  describe("attempt limit (max 5)", () => {
    it("five wrong codes are 422; the sixth call — even with the right code — is 429 until a new code is requested", async () => {
      app = await testApp();
      await register(app);
      const good = otpFor(app, EMAIL);
      const bad = wrongCode(good);
      for (let i = 1; i <= 5; i++) expect((await verifyEmailCode(app, EMAIL, bad)).statusCode, `attempt ${i}`).toBe(422);

      const locked = await verifyEmailCode(app, EMAIL, good);
      expect(locked.statusCode).toBe(429);
      expect(locked.json().message).toContain("اطلب رمزاً جديداً");
      const u = await userRow();
      expect(u.email_otp_hash).toBeNull(); // the code died with the fifth failure
      expect(u.email_verified_at).toBeNull();

      // a fresh code resets everything
      expect((await post(app, "/auth/resend-verification", { email: EMAIL })).statusCode).toBe(200);
      expect((await userRow()).email_otp_attempts).toBe(0);
      expect((await verifyEmailCode(app, EMAIL, otpFor(app, EMAIL))).statusCode).toBe(200);
    });

    it("the right code still works on the fifth attempt", async () => {
      app = await testApp();
      await register(app);
      const good = otpFor(app, EMAIL);
      for (let i = 0; i < 4; i++) await verifyEmailCode(app, EMAIL, wrongCode(good));
      expect((await verifyEmailCode(app, EMAIL, good)).statusCode).toBe(200);
    });

    it("parallel guesses cannot exceed the limit", async () => {
      app = await testApp();
      await register(app);
      const bad = wrongCode(otpFor(app, EMAIL));
      const results = await Promise.all(Array.from({ length: 15 }, () => verifyEmailCode(app, EMAIL, bad)));
      const codes = results.map((r) => r.statusCode);
      expect(codes.filter((c) => c === 422).length).toBeLessThanOrEqual(5);
      expect(codes.every((c) => c === 422 || c === 429)).toBe(true);
      expect((await userRow()).email_otp_attempts).toBeLessThanOrEqual(5);
    });

    it("unknown and already-verified addresses behave identically: five 422, then 429 (no enumeration)", async () => {
      app = await testApp();
      await registerVerified(app);
      const known = await (async () => {
        await register(app, { admin_email: "pending@org.org", organization_name: "P" });
        const good = otpFor(app, "pending@org.org");
        return { email: "pending@org.org", bad: wrongCode(good) };
      })();

      const sequence = async (email, bad) => {
        const out = [];
        for (let i = 0; i < 6; i++) out.push((await verifyEmailCode(app, email, bad)).statusCode);
        return out;
      };
      const expected = [422, 422, 422, 422, 422, 429];
      expect(await sequence(known.email, known.bad)).toEqual(expected);
      expect(await sequence("ghost@nowhere.org", "123456")).toEqual(expected); // unknown
      expect(await sequence(EMAIL, "123456")).toEqual(expected); // verified
      // the answers carry the same text too
      const a = await verifyEmailCode(app, "ghost2@nowhere.org", "123456");
      app.limiter.clear();
      const b = await verifyEmailCode(app, EMAIL, "123456");
      expect(a.json()).toEqual(b.json());
    });

    it("per-IP ceiling on the endpoint", async () => {
      app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
      const codes = [];
      for (let i = 0; i < 32; i++) codes.push((await verifyEmailCode(app, `u${i}@x.org`, "123456")).statusCode);
      expect(codes.slice(0, 30).every((c) => c === 422)).toBe(true);
      expect(codes[30]).toBe(429);
    });
  });

  describe("expiry (15 minutes)", () => {
    it("a correct code is rejected once expired, and the code is discarded", async () => {
      app = await testApp();
      await register(app);
      const code = otpFor(app, EMAIL);
      await app.db("users").where({ email: EMAIL }).update({ email_otp_expires_at: new Date(Date.now() - 1000).toISOString() });
      const res = await verifyEmailCode(app, EMAIL, code);
      expect(res.statusCode).toBe(422);
      expect(res.json().errors.code[0]).toContain("منتهي الصلاحية");
      const u = await userRow();
      expect(u.email_verified_at).toBeNull();
      expect(u.email_otp_hash).toBeNull();

      await post(app, "/auth/resend-verification", { email: EMAIL });
      expect((await verifyEmailCode(app, EMAIL, otpFor(app, EMAIL))).statusCode).toBe(200);
    });

    it("is still valid a minute before it expires", async () => {
      app = await testApp();
      await register(app);
      await app.db("users").where({ email: EMAIL }).update({ email_otp_expires_at: new Date(Date.now() + 60_000).toISOString() });
      expect((await verifyEmailCode(app, EMAIL, otpFor(app, EMAIL))).statusCode).toBe(200);
    });

    it("the lifetime is configurable", async () => {
      app = await testApp({ env: { EMAIL_OTP_TTL_MINUTES: "5" } });
      await register(app);
      const ttl = new Date((await userRow()).email_otp_expires_at).getTime() - Date.now();
      expect(ttl).toBeLessThanOrEqual(5 * 60_000);
      expect(ttl).toBeGreaterThan(4 * 60_000);
      expect(app.mailer.outbox[0].text).toContain("5 دقيقة");
    });
  });
});

describe("POST /auth/resend-verification", () => {
  it("issues a fresh code, invalidating the previous one, with a new expiry and zero attempts", async () => {
    app = await testApp();
    await register(app);
    const first = otpFor(app, EMAIL);
    await verifyEmailCode(app, EMAIL, wrongCode(first)); // one failed attempt on the first code
    const before = await userRow();
    await sleep(15);

    const res = await post(app, "/auth/resend-verification", { email: "Admin@Org.org" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: expect.any(String), expires_in_minutes: 15, resend_after_seconds: 0 });
    expect(app.mailer.outbox).toHaveLength(2);

    const second = otpFor(app, EMAIL);
    const after = await userRow();
    expect(after.email_otp_hash).not.toBe(before.email_otp_hash);
    expect(after.email_otp_attempts).toBe(0);
    expect(new Date(after.email_otp_expires_at).getTime()).toBeGreaterThan(new Date(before.email_otp_expires_at).getTime());

    if (second !== first) expect((await verifyEmailCode(app, EMAIL, first)).statusCode).toBe(422); // the old code is dead
    expect((await verifyEmailCode(app, EMAIL, second)).statusCode).toBe(200);
  });

  it("answers 400 for verified users (mails nothing) and 200 for unknown e-mails (mails nothing)", async () => {
    app = await testApp();
    await registerVerified(app);
    const before = app.mailer.outbox.length;
    const verified = await post(app, "/auth/resend-verification", { email: EMAIL });
    expect(verified.statusCode).toBe(400);
    expect(verified.json().message).toMatch(/مفعّل/);
    const ghost = await post(app, "/auth/resend-verification", { email: "ghost@x.org" });
    expect(ghost.statusCode).toBe(200);
    expect(ghost.json().message).toBe((await post(app, "/auth/resend-verification", { email: "ghost2@x.org" })).json().message);
    expect(app.mailer.outbox).toHaveLength(before);
  });

  it("validates the body", async () => {
    app = await testApp();
    expect((await post(app, "/auth/resend-verification", {})).json().errors.email).toBeTruthy();
    expect((await post(app, "/auth/resend-verification", { email: "x" })).statusCode).toBe(422);
  });

  it("allows 3 codes per address per 10 minutes", async () => {
    app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
    await register(app);
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await post(app, "/auth/resend-verification", { email: EMAIL })).statusCode);
    expect(codes).toEqual([200, 200, 200, 429]);
  });

  it("enforces a cooldown between codes — counted from registration, identical for unknown addresses", async () => {
    app = await testApp({ env: { EMAIL_OTP_RESEND_COOLDOWN_SECONDS: "1" } });
    await register(app);
    const tooSoon = await post(app, "/auth/resend-verification", { email: EMAIL });
    expect(tooSoon.statusCode).toBe(429);
    expect(tooSoon.json().message).toMatch(/يرجى الانتظار \d+ ثانية/);
    expect(app.mailer.outbox).toHaveLength(1); // nothing was sent

    // an address that does not exist is throttled the same way (nothing to learn from the cooldown)
    expect((await post(app, "/auth/resend-verification", { email: "ghost@x.org" })).statusCode).toBe(200);
    expect((await post(app, "/auth/resend-verification", { email: "ghost@x.org" })).statusCode).toBe(429);

    await sleep(1100);
    expect((await post(app, "/auth/resend-verification", { email: EMAIL })).statusCode).toBe(200);
    expect(app.mailer.outbox).toHaveLength(2);
    expect((await post(app, "/auth/resend-verification", { email: EMAIL })).statusCode).toBe(429); // new cooldown
  });

  it("advertises the cooldown to the client", async () => {
    app = await testApp({ env: { EMAIL_OTP_RESEND_COOLDOWN_SECONDS: "45" } });
    await register(app);
    const res = await post(app, "/auth/resend-verification", { email: EMAIL });
    expect(res.statusCode).toBe(429);
    app.limiter.clear();
    expect((await post(app, "/auth/resend-verification", { email: EMAIL })).json().resend_after_seconds).toBe(45);
  });
});

describe("e-mail change re-verification uses a code too", () => {
  it("changing an employee's e-mail un-verifies them and mails a code that verifies the new address", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const staff = await member(app, admin, { email: "s@org.org", name: "S" });
    const res = await send("PUT", `/employees/${staff.userId}`, { email: "s-new@org.org" }, admin.headers);
    expect(res.statusCode).toBe(200);
    expect((await login(app, "s-new@org.org")).statusCode).toBe(403);
    const code = otpFor(app, "s-new@org.org");
    expect(code).toMatch(/^[0-9]{6}$/);
    expect((await verifyEmailCode(app, "s-new@org.org", code)).statusCode).toBe(200);
    expect((await login(app, "s-new@org.org")).statusCode).toBe(200);
    void bearer;
  });
});

describe("SMTP configuration and delivery", () => {
  const smtpEnv = (over = {}) =>
    loadEnv({ NODE_ENV: "test", SMTP_HOST: "smtp.example.com", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "user@example.com", SMTP_PASS: "s3cret", SMTP_FROM: "MASAR <noreply@example.com>", ...over });

  function fakeNodemailer({ failSend = false, failVerify = false } = {}) {
    const calls = { createTransport: [], sendMail: [], verify: 0 };
    const nodemailer = {
      createTransport(options) {
        calls.createTransport.push(options);
        return {
          sendMail: async (mail) => {
            if (failSend) throw new Error("connection refused");
            calls.sendMail.push(mail);
          },
          verify: async () => {
            calls.verify += 1;
            if (failVerify) throw new Error("auth failed");
          },
        };
      },
    };
    return { calls, loader: async () => nodemailer };
  }

  it("reads SMTP_HOST / PORT / SECURE / USER / PASS / FROM from the environment and selects SMTP automatically", async () => {
    const env = smtpEnv();
    expect(env).toMatchObject({ mailTransport: "smtp", SMTP_HOST: "smtp.example.com", SMTP_PORT: 465, SMTP_SECURE: true, SMTP_USER: "user@example.com", SMTP_PASS: "s3cret", SMTP_FROM: "MASAR <noreply@example.com>" });
    const { calls, loader } = fakeNodemailer();
    const mailer = createMailer(env, undefined, loader);
    await mailer.send({ to: "a@b.org", subject: "s", text: "t" });
    await mailer.send({ to: "c@d.org", subject: "s2", text: "t2" });
    expect(calls.createTransport).toEqual([{ host: "smtp.example.com", port: 465, secure: true, auth: { user: "user@example.com", pass: "s3cret" } }]); // one pooled transport
    expect(calls.sendMail).toHaveLength(2);
    expect(calls.sendMail[0]).toMatchObject({ from: "MASAR <noreply@example.com>", to: "a@b.org", subject: "s", text: "t" });
    expect(mailer.outbox).toHaveLength(0); // nothing is kept in memory when really sending
  });

  it("defaults to port 587 / STARTTLS, and omits auth when no user is configured", async () => {
    const env = loadEnv({ NODE_ENV: "test", SMTP_HOST: "relay.internal" });
    expect(env).toMatchObject({ SMTP_PORT: 587, SMTP_SECURE: false });
    const { calls, loader } = fakeNodemailer();
    await createMailer(env, undefined, loader).send({ to: "a@b.org", subject: "s", text: "t" });
    expect(calls.createTransport[0]).toEqual({ host: "relay.internal", port: 587, secure: false });
  });

  it("falls back to the in-memory console transport without SMTP_HOST (development only)", () => {
    expect(loadEnv({ NODE_ENV: "test" }).mailTransport).toBe("console");
    expect(loadEnv({ NODE_ENV: "development" }).mailTransport).toBe("console");
    expect(loadEnv({ NODE_ENV: "test", MAIL_TRANSPORT: "none" }).mailTransport).toBe("none");
  });

  it("refuses inconsistent or insecure configurations", () => {
    expect(() => loadEnv({ NODE_ENV: "test", MAIL_TRANSPORT: "smtp" })).toThrow(/SMTP_HOST/);
    const prod = { NODE_ENV: "production", SIGNING_SECRET: "s".repeat(40), DATABASE_URL: "postgres://u@h/d" };
    expect(() => loadEnv(prod)).toThrow(/SMTP_HOST/); // codes would only be printed to the console
    expect(loadEnv({ ...prod, SMTP_HOST: "smtp.example.com" }).mailTransport).toBe("smtp");
    expect(() => loadEnv({ ...prod, SMTP_HOST: "h", SMTP_PORT: "70000" })).toThrow(/SMTP_PORT/);
  });

  it("a delivery failure never fails the request; the code is stored and can be re-sent", async () => {
    const { loader } = fakeNodemailer({ failSend: true });
    const errors = [];
    const mailer = createMailer(smtpEnv(), { error: (...a) => errors.push(a), info() {} }, loader);
    await expect(mailer.sendSafe({ to: "a@b.org", subject: "s", text: "t" })).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    await expect(mailer.send({ to: "a@b.org", subject: "s", text: "t" })).rejects.toThrow("connection refused");
  });

  it("registration succeeds even when the SMTP server is unreachable (code stored, resend possible)", async () => {
    app = await testApp({ env: { SMTP_HOST: "127.0.0.1", SMTP_PORT: "9" } });
    expect(app.config.mailTransport).toBe("smtp");
    const res = await post(app, "/auth/register", registrationBody());
    expect(res.statusCode).toBe(201);
    expect((await userRow()).email_otp_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verify() reports a healthy or broken SMTP connection without throwing", async () => {
    const ok = fakeNodemailer();
    expect(await createMailer(smtpEnv(), undefined, ok.loader).verify()).toBe(true);
    expect(ok.calls.verify).toBe(1);
    const bad = fakeNodemailer({ failVerify: true });
    expect(await createMailer(smtpEnv(), { error() {}, info() {} }, bad.loader).verify()).toBe(false);
    expect(await createMailer(testEnv(), undefined).verify()).toBe(true); // console transport: nothing to check
  });
});

describe("console fallback for development and demos", () => {
  it("prints the code clearly to the server console outside production", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    app = await testApp({ env: { LOG_LEVEL: "info" } });
    await register(app);
    const printed = log.mock.calls.map((c) => c.join(" ")).join("\n");
    const code = otpFor(app, EMAIL);
    expect(printed).toContain(EMAIL);
    expect(printed).toContain(`code   : ${code}`);
    expect(printed).toContain("15 minutes");
  });

  it("prints a fresh code on every resend and every e-mail change", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    app = await testApp({ env: { LOG_LEVEL: "info" } });
    await register(app);
    await post(app, "/auth/resend-verification", { email: EMAIL });
    const lines = log.mock.calls.map((c) => c.join(" ")).filter((l) => l.includes("code   :"));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(otpFor(app, EMAIL));
  });

  it("never prints in production, and stays quiet when logging is silent", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    app = await testApp({ env: { LOG_LEVEL: "info" }, patch: { isProd: true } });
    await register(app);
    expect(log).not.toHaveBeenCalled();
    await app.close();

    app = await testApp({ env: { LOG_LEVEL: "silent" } });
    await register(app);
    expect(log).not.toHaveBeenCalled();
  });
});

describe("the aliases and the login hint", () => {
  it("POST /register-organization still works and sends a code; login for an unverified user says to verify the e-mail", async () => {
    app = await testApp();
    expect((await post(app, "/register-organization", registrationBody())).statusCode).toBe(201);
    const res = await login(app);
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain("تفعيل البريد الإلكتروني");
    expect(PASSWORD).toBeTruthy();
  });
});
