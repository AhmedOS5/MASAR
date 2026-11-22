// Registration, e-mail verification by 6-digit code (OTP), and login. Pure logic + queries; routes.js only does HTTP.
//
// OTP rules (see docs/backend-rules.md §1):
//  * one active code per user, stored only as a keyed hash with an expiry (EMAIL_OTP_TTL_MINUTES, default 15);
//  * issuing a code (registration, resend, e-mail change) overwrites the previous one and resets the attempt counter;
//  * at most EMAIL_OTP_MAX_ATTEMPTS (5) wrong submissions per code — the 5th wrong one invalidates it, the next call is 429
//    until a new code is requested. The counter is atomic in the database, so parallel guesses cannot exceed it;
//  * unknown / already-verified addresses behave exactly like wrong codes (no account enumeration);
//  * resend: cooldown between codes (EMAIL_OTP_RESEND_COOLDOWN_SECONDS) + 3 per 10 minutes per address.
import { HttpError, ValidationError, forbidden, unauthorized } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { issueToken } from "../../lib/tokens.js";
import { generateOtp, hashOtp, otpMatches } from "../../lib/otp.js";
import { inviteEmail, otpEmail, passwordChangedEmail, passwordResetEmail } from "../../lib/mailer.js";
import { iso, nowIso } from "../../lib/time.js";
import { provisionOrganization } from "../organizations/provisioning.js";
import { ORG_BLOCKED, USER_CONTEXT_COLUMNS, loadPermissions, toAuthContext, userContextQuery } from "./context.js";

const FIFTEEN_MIN = 15 * 60_000;
export const MAX_FAILED_LOGINS = 5;

export const OTP_INVALID_MESSAGE = "الرمز غير صحيح أو منتهي الصلاحية.";
export const OTP_LOCKED_MESSAGE = "تجاوزت عدد المحاولات المسموح بها. اطلب رمزاً جديداً.";
export const OTP_THROTTLED_MESSAGE = "تجاوزت عدد المحاولات الخاطئة خلال الساعة الأخيرة. حاول مجدداً لاحقاً.";

const HOUR_MS = 3_600_000; // the in-memory limiter forgets hits older than an hour
/** Wrong reset codes tolerated per address per hour, summed over all codes issued in that hour (× RATE_LIMIT_SCALE). */
export const RESET_FAILURES_PER_HOUR = 10;

export function createAuthService(app) {
  const { db, config, mailer, limiter } = app;
  const scale = config.RATE_LIMIT_SCALE;
  const ttlMs = config.EMAIL_OTP_TTL_MINUTES * 60_000;
  const inviteTtlMs = config.INVITE_TTL_HOURS * 3_600_000;
  const maxAttempts = config.EMAIL_OTP_MAX_ATTEMPTS;
  const cooldownMs = config.EMAIL_OTP_RESEND_COOLDOWN_SECONDS * 1000;
  let dummyHash; // verified against when the e-mail is unknown, so timing does not reveal existence

  /** Development/demo aid: the code is printed to the server console whenever this is not production. */
  function printOtp(email, code, validFor, title = "e-mail verification code (OTP)") {
    if (config.isProd || config.LOG_LEVEL === "silent") return;
    console.log(
      [
        "",
        `┌──────────── MASAR · ${title} ────────────`,
        `│ e-mail : ${email}`,
        `│ code   : ${code}`,
        `│ valid  : ${validFor}   (printed because NODE_ENV is not production)`,
        "└────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
  }

  /** One active code per user: store its keyed hash + expiry (overwriting = invalidating the previous one), attempts back to 0. */
  async function issueCode(user, lifetimeMs) {
    const code = generateOtp();
    const now = Date.now();
    await db("users")
      .where({ id: user.id })
      .update({
        email_otp_hash: hashOtp(config.signingSecret, user.id, code),
        email_otp_expires_at: new Date(now + lifetimeMs).toISOString(),
        email_otp_attempts: 0,
        email_otp_sent_at: new Date(now).toISOString(),
        updated_at: nowIso(),
      });
    return code;
  }

  /**
   * Issue a fresh code for the user (invalidating any previous one), store its hash + expiry, and e-mail it.
   * Mail failures are logged, never thrown: the user can ask for another code.
   */
  async function sendVerificationCode(user, organizationName) {
    const code = await issueCode(user, ttlMs);
    printOtp(user.email, code, `${config.EMAIL_OTP_TTL_MINUTES} minutes`);
    mailer.sendSafe({
      to: user.email,
      ...otpEmail({ name: user.name, organizationName, code, ttlMinutes: config.EMAIL_OTP_TTL_MINUTES }),
    });
  }

  /**
   * Invite an employee an admin has added: a code (valid INVITE_TTL_HOURS) that lets them choose their password on
   * /set-password. Re-issuing invalidates the previous invitation. Mail failures are logged, never thrown (an admin can resend).
   */
  async function sendInvite(user, organizationName) {
    const code = await issueCode(user, inviteTtlMs);
    printOtp(user.email, code, `${config.INVITE_TTL_HOURS} hours`, "employee invitation code");
    mailer.sendSafe({
      to: user.email,
      ...inviteEmail({
        name: user.name,
        organizationName,
        code,
        ttlHours: config.INVITE_TTL_HOURS,
        setPasswordUrl: `${config.FRONTEND_ORIGIN}/set-password?email=${encodeURIComponent(user.email)}`,
      }),
    });
  }

  /**
   * Password reset code for a verified, active user with a password (valid EMAIL_OTP_TTL_MINUTES). The kind of code is implied
   * by the account's state — no password: invitation; password but unverified: verification; password and verified: reset —
   * and the three states are mutually exclusive, so a code of one kind can never be redeemed as another.
   */
  async function sendPasswordReset(user) {
    const code = await issueCode(user, ttlMs);
    printOtp(user.email, code, `${config.EMAIL_OTP_TTL_MINUTES} minutes`, "password reset code");
    mailer.sendSafe({
      to: user.email,
      ...passwordResetEmail({
        name: user.name,
        code,
        ttlMinutes: config.EMAIL_OTP_TTL_MINUTES,
        resetUrl: `${config.FRONTEND_ORIGIN}/reset-password?email=${encodeURIComponent(user.email)}`,
      }),
    });
  }

  async function register(input) {
    const passwordHash = await hashPassword(input.admin_password, { logN: config.SCRYPT_LOG_N });
    const adminName = input.admin_name || input.admin_email.split("@")[0];

    let ids;
    try {
      ids = await db.transaction(async (trx) => {
        if (await trx("users").where({ email: input.admin_email }).first("id")) {
          throw new ValidationError({ admin_email: ["هذا البريد مستخدم مسبقاً."] });
        }
        return provisionOrganization(trx, {
          org: { name: input.organization_name, type: input.organization_type, email: input.organization_email, phone: input.organization_phone, region: input.organization_region },
          admin: { name: adminName, email: input.admin_email, passwordHash },
        });
      });
    } catch (err) {
      // Two simultaneous registrations with the same e-mail: the unique index is the real guard.
      if (/unique|duplicate/i.test(String(err?.message))) {
        throw new ValidationError({ admin_email: ["هذا البريد مستخدم مسبقاً."] });
      }
      throw err;
    }

    if (cooldownMs > 0) limiter.hit(`otp-cooldown:${input.admin_email}`, cooldownMs); // the first code counts as "just sent"
    await sendVerificationCode({ id: ids.userId, email: input.admin_email, name: adminName }, input.organization_name);
  }

  const resendAnswer = () => ({
    message: "إذا كان البريد مسجلاً فسيصلك رمز تحقق جديد خلال لحظات.",
    expires_in_minutes: config.EMAIL_OTP_TTL_MINUTES,
    resend_after_seconds: config.EMAIL_OTP_RESEND_COOLDOWN_SECONDS,
  });

  async function resend(address) {
    const quotaKey = `resend:${address}`;
    const cooldownKey = `otp-cooldown:${address}`;
    limiter.assert(quotaKey, 3 * scale, 10 * 60_000);
    if (cooldownMs > 0) {
      const wait = limiter.retryAfterMs(cooldownKey, cooldownMs);
      if (wait > 0) throw new HttpError(429, `يرجى الانتظار ${Math.ceil(wait / 1000)} ثانية قبل طلب رمز جديد.`);
    }
    limiter.hit(quotaKey, 10 * 60_000);
    if (cooldownMs > 0) limiter.hit(cooldownKey, cooldownMs); // applies to unknown addresses too
    // A new code gives an existing account fresh attempts; an unknown address must get them too, or "the 6th wrong guess is
    // refused even after a re-send" would reveal which addresses do not exist.
    limiter.reset(`otp-fail:verify:${address}`);

    const user = await db("users as u")
      .leftJoin("organizations as o", "o.id", "u.organization_id")
      .where("u.email", address)
      .first("u.id", "u.name", "u.email", "u.email_verified_at", "u.password_hash", "o.name as org_name");
    if (user?.email_verified_at) throw new HttpError(400, "البريد الإلكتروني مفعّل مسبقاً.");
    // An invited employee (no password yet) is re-invited by an organization admin only: a public resend would let anyone
    // who knows the address keep issuing fresh codes and brute-force the invitation. Same answer, nothing is mailed.
    if (user?.password_hash) await sendVerificationCode(user, user.org_name ?? "");
    return resendAnswer(); // same answer whether or not the account exists
  }

  const forgotAnswer = () => ({
    message: "إذا كان البريد مسجلاً فسيصلك رمز إعادة تعيين كلمة المرور خلال لحظات.",
    expires_in_minutes: config.EMAIL_OTP_TTL_MINUTES,
    resend_after_seconds: config.EMAIL_OTP_RESEND_COOLDOWN_SECONDS,
  });

  const resetCapKey = (address) => `reset-fails:${address}`;
  const resetCap = (address) => ({ key: resetCapKey(address), max: RESET_FAILURES_PER_HOUR * scale, windowMs: HOUR_MS });
  const resetCapped = (address) => {
    try {
      limiter.assert(resetCapKey(address), RESET_FAILURES_PER_HOUR * scale, HOUR_MS);
      return false;
    } catch {
      return true;
    }
  };

  /**
   * "I forgot my password": e-mail a reset code if the address belongs to a verified, active user with a password.
   * The answer — including every rate-limit refusal — is identical for every address, so it reveals nothing about accounts.
   * Unlike an invitation, anyone may ask for a new code; the brute-force guard is the hourly cap on wrong guesses (below).
   */
  async function forgotPassword(address) {
    const quotaKey = `forgot:${address}`;
    const cooldownKey = `forgot-cooldown:${address}`;
    limiter.assert(quotaKey, 3 * scale, 10 * 60_000);
    if (cooldownMs > 0) {
      const wait = limiter.retryAfterMs(cooldownKey, cooldownMs);
      if (wait > 0) throw new HttpError(429, `يرجى الانتظار ${Math.ceil(wait / 1000)} ثانية قبل طلب رمز جديد.`);
    }
    limiter.hit(quotaKey, 10 * 60_000);
    if (cooldownMs > 0) limiter.hit(cooldownKey, cooldownMs); // applies to unknown addresses too
    limiter.reset(`otp-fail:reset:${address}`); // fresh attempts for known AND unknown addresses (see resend)

    // While the address is over its hourly failure cap nothing is mailed (a new code would only feed more guesses).
    if (!resetCapped(address)) {
      const user = await db("users as u")
        .leftJoin("organizations as o", "o.id", "u.organization_id")
        .where("u.email", address)
        .first("u.id", "u.name", "u.email", "u.email_verified_at", "u.password_hash", "u.status", "o.status as org_status");
      // Unverified accounts use their verification code, invited ones their invitation: nothing is mailed for them.
      const eligible =
        user && user.email_verified_at && user.password_hash && user.status === "active" && !ORG_BLOCKED.has(user.org_status);
      if (eligible) await sendPasswordReset(user);
    }
    return forgotAnswer();
  }

  /**
   * Redeem the e-mailed code of `purpose` ("verify" | "invite" | "reset") for the address. Shared rules (docs/backend-rules.md §1):
   *  * addresses that are not eligible for this purpose (unknown, already done, no active code) are throttled in memory with
   *    the same limit, so the outside world sees the same "5 × 422, then 429" for every address;
   *  * one attempt is reserved atomically BEFORE comparing, so parallel guesses cannot get more than `maxAttempts` tries;
   *  * the code dies once it is expired or its attempts are used up.
   * `redeem(user)` applies the effect; it returns a falsy value if it lost a race (reported like a wrong code).
   */
  async function redeemCode({ email: address, code }, { purpose, windowMs, eligible, redeem, failCap }) {
    const invalid = () => new ValidationError({ code: [OTP_INVALID_MESSAGE] }, OTP_INVALID_MESSAGE);
    // EVERY 429 about a code carries this one text — known and unknown addresses must not be tellable apart by it.
    const locked = () => new HttpError(429, OTP_LOCKED_MESSAGE);
    // Optional cumulative cap on FAILURES for the address across codes (a new code resets the per-code attempts, so without
    // it five guesses per freshly requested code could go on forever). Counted for every address, existing or not.
    const failed = () => {
      if (failCap) limiter.hit(failCap.key, failCap.windowMs);
      return invalid();
    };
    if (failCap) {
      try {
        limiter.assert(failCap.key, failCap.max, failCap.windowMs);
      } catch {
        throw new HttpError(429, OTP_THROTTLED_MESSAGE);
      }
    }
    const failKey = `otp-fail:${purpose}:${address}`; // per purpose: hammering one flow cannot lock the other
    try {
      limiter.assert(failKey, maxAttempts, windowMs);
    } catch {
      throw locked();
    }

    const user = await db("users")
      .where({ email: address })
      .first("id", "name", "email_verified_at", "password_hash", "email_otp_hash", "email_otp_attempts");
    const ok = Boolean(user) && eligible(user);
    if (ok && user.email_otp_attempts >= maxAttempts) throw locked();
    if (!ok || !user.email_otp_hash) {
      limiter.hit(failKey, windowMs);
      throw failed();
    }

    const reserved = await db("users")
      .where({ id: user.id })
      .where("email_otp_attempts", "<", maxAttempts)
      .whereNotNull("email_otp_hash")
      .increment("email_otp_attempts", 1);
    if (!reserved) throw locked();

    const row = await db("users").where({ id: user.id }).first("email_otp_hash", "email_otp_expires_at", "email_otp_attempts");
    const expired = !row.email_otp_expires_at || new Date(iso(row.email_otp_expires_at)) <= new Date();
    if (!expired && row.email_otp_hash && otpMatches(config.signingSecret, user.id, code, row.email_otp_hash)) {
      const result = await redeem(user);
      if (result) {
        limiter.reset(failKey);
        return result;
      }
    }

    // Wrong or expired: the code dies once it is expired or the attempts are used up.
    if (expired || row.email_otp_attempts >= maxAttempts) {
      await db("users").where({ id: user.id }).update({ email_otp_hash: null, email_otp_expires_at: null });
    }
    throw failed();
  }

  /** Registration / e-mail change: the user already has a password and only has to prove the address. */
  const verifyEmail = (input) =>
    redeemCode(input, {
      purpose: "verify",
      windowMs: ttlMs,
      // an invited employee (no password) must go through set-password: verifying alone would burn their invitation code
      eligible: (u) => !u.email_verified_at && Boolean(u.password_hash),
      redeem: async (u) => {
        await db("users").where({ id: u.id }).update({
          email_verified_at: nowIso(),
          email_otp_hash: null,
          email_otp_expires_at: null,
          email_otp_attempts: 0,
          updated_at: nowIso(),
        });
        return { verified: true, message: "تم تفعيل البريد بنجاح." };
      },
    });

  /** Invited employee: the invitation code proves the address AND authorises choosing the first password, in one step. */
  const setPassword = ({ email: address, code, password }) =>
    redeemCode({ email: address, code }, {
      purpose: "invite",
      windowMs: Math.min(inviteTtlMs, 3_600_000), // the in-memory limiter forgets hits after an hour
      eligible: (u) => !u.password_hash,
      redeem: async (u) => {
        const passwordHash = await hashPassword(password, { logN: config.SCRYPT_LOG_N }); // only after the code is right
        const done = await db("users").where({ id: u.id }).whereNull("password_hash").update({
          password_hash: passwordHash,
          email_verified_at: nowIso(),
          email_otp_hash: null,
          email_otp_expires_at: null,
          email_otp_attempts: 0,
          updated_at: nowIso(),
        });
        return done ? { activated: true, message: "تم تفعيل حسابك. يمكنك الآن تسجيل الدخول." } : null;
      },
    });

  /**
   * Choose a new password with the reset code. Besides the shared rules: the password changes in one transaction that also
   * ends EVERY session of the user (a stolen token must not survive a reset), the login lockout is lifted, the code is
   * single-use even under parallel requests (the update is conditional on the very code that was just checked), and the
   * owner is told by e-mail.
   */
  const resetPassword = ({ email: address, code, password }) =>
    redeemCode({ email: address, code }, {
      purpose: "reset",
      windowMs: ttlMs,
      failCap: resetCap(address),
      eligible: (u) => Boolean(u.email_verified_at) && Boolean(u.password_hash),
      redeem: async (u) => {
        const passwordHash = await hashPassword(password, { logN: config.SCRYPT_LOG_N }); // only after the code is right
        const done = await db.transaction(async (trx) => {
          const changed = await trx("users")
            .where({ id: u.id, email_otp_hash: u.email_otp_hash })
            .whereNotNull("password_hash")
            .update({
              password_hash: passwordHash,
              email_otp_hash: null,
              email_otp_expires_at: null,
              email_otp_attempts: 0,
              updated_at: nowIso(),
            });
          if (changed) await trx("auth_tokens").where({ user_id: u.id }).del();
          return changed;
        });
        if (!done) return null;
        limiter.reset(`login:${address}`); // failed-login lockout (5 / 15 min) must not outlive the reason for it
        mailer.sendSafe({ to: address, ...passwordChangedEmail({ name: u.name }) });
        return { reset: true, message: "تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة." };
      },
    });

  async function login({ admin_email: address, admin_password: password }) {
    const key = `login:${address}`;
    limiter.assert(key, MAX_FAILED_LOGINS * scale, FIFTEEN_MIN);

    const row = await userContextQuery(db).where("u.email", address).first(...USER_CONTEXT_COLUMNS);

    let ok;
    if (row?.password_hash) {
      ok = await verifyPassword(password, row.password_hash);
    } else {
      dummyHash ??= await hashPassword("dummy-password", { logN: config.SCRYPT_LOG_N });
      await verifyPassword(password, dummyHash);
      ok = false;
    }
    if (!ok) {
      limiter.hit(key, FIFTEEN_MIN);
      throw unauthorized("بيانات الدخول غير صحيحة.");
    }
    limiter.reset(key);

    // Only after the password is proven do we reveal account state.
    if (!row.email_verified_at) throw forbidden("يرجى تفعيل البريد الإلكتروني أولاً.");
    if (row.user_status !== "active") throw forbidden("هذا الحساب غير نشط، تواصل مع مدير النظام.");
    if (ORG_BLOCKED.has(row.org_status)) {
      // The password is proven, so say why: the status and the operator's reason (the same text that was e-mailed).
      const org = await db("organizations").where({ id: row.organization_id }).first("rejection_reason");
      throw new HttpError(403, "حساب المنظمة معلّق أو مرفوض، تواصل مع الدعم.", {
        extra: { organization_status: row.org_status, reason: org?.rejection_reason ?? null },
      });
    }

    const token = await issueToken(db, row.user_id, config.TOKEN_TTL_DAYS);
    await db("users").where({ id: row.user_id }).update({ last_login_at: nowIso() });
    return { token, ctx: toAuthContext(row, await loadPermissions(db, row)) };
  }

  const logout = (tokenId) => db("auth_tokens").where({ id: tokenId }).del();

  return { register, resend, verifyEmail, setPassword, forgotPassword, resetPassword, login, logout, sendVerificationCode, sendInvite };
}
