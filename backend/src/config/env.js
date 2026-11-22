// Validated, typed environment. Nothing else in the codebase reads process.env directly.
import { z } from "zod";
import path from "node:path";
import { isIP } from "node:net";

export const BACKEND_ROOT = path.resolve(import.meta.dirname, "..", "..");

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || ["1", "true", "yes"].includes(String(v).toLowerCase()));

// ---- TRUST_PROXY -----------------------------------------------------------------------------------------------
// Which peers may tell us the real client address (X-Forwarded-For). It decides `request.ip`, the key of every per-IP
// rate limit. Accepted values:
//   false (default) | true | a comma-separated list of IPs / CIDR ranges / the keywords loopback, linklocal, uniquelocal
//   e.g.  TRUST_PROXY=loopback           the Next.js server runs on the same machine
//         TRUST_PROXY=10.0.0.0/8,fd00::/8  it runs in the private network
// A list is the SAFE setting: X-Forwarded-For is believed only when the TCP peer is one of those addresses. `true` believes
// everyone (the leftmost entry wins), so a client that can reach this API directly can forge its address and dodge the limits.
const TRUST_KEYWORDS = new Set(["loopback", "linklocal", "uniquelocal"]);

function isTrustEntry(entry) {
  if (TRUST_KEYWORDS.has(entry.toLowerCase())) return true;
  const [addr, prefix, extra] = entry.split("/");
  const family = isIP(addr);
  if (!family || extra !== undefined) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128);
}

/** "false" | "true" | "<list>" (or the booleans) -> false | true | string[]; throws on anything else (no silent fallback). */
export function parseTrustProxy(raw) {
  if (raw === true || raw === false) return raw;
  const value = String(raw ?? "").trim();
  if (value === "" || ["0", "false", "no"].includes(value.toLowerCase())) return false;
  if (["1", "true", "yes"].includes(value.toLowerCase())) return true;
  const entries = value.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = entries.filter((e) => !isTrustEntry(e));
  if (bad.length) {
    throw new Error(`"${bad.join(", ")}" is not an IP address, CIDR range, loopback, linklocal or uniquelocal (use false, true or a comma-separated list)`);
  }
  return entries;
}

const trustProxy = z
  .union([z.boolean(), z.string()])
  .default(false)
  .transform((value, ctx) => {
    try {
      return parseTrustProxy(value);
    } catch (err) {
      ctx.addIssue({ code: "custom", message: err.message });
      return z.NEVER;
    }
  });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(0).max(65535).default(4010),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  // postgres://… for PostgreSQL; anything else (or empty) falls back to the SQLite file below.
  DATABASE_URL: z.string().default(""),
  SQLITE_PATH: z.string().default("data/masar.sqlite"),

  // Origin of the frontend (used for the login link in e-mails only; the API itself has no CORS surface).
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),

  // Server secret: keys the hash of e-mail verification codes. Required in production.
  SIGNING_SECRET: z.string().default(""),
  TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),

  // E-mail verification by a 6-digit one-time code (OTP).
  EMAIL_OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  EMAIL_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  // Minimum wait between two codes sent to the same address (0 disables the cooldown).
  EMAIL_OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),

  // Employee invitation: the code e-mailed to an employee added by an admin, used on /set-password to choose a password.
  // Longer than the verification code because the invitee may not read the mail straight away; only an admin can re-issue it.
  INVITE_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(48),

  // scrypt cost (log2 N). 15 is the production default; tests use a lower value for speed.
  SCRYPT_LOG_N: z.coerce.number().int().min(10).max(20).default(15),
  // Multiplies every login/register/resend limit (tests raise it; keep 1 in production).
  RATE_LIMIT_SCALE: z.coerce.number().min(1).default(1),

  UPLOAD_DIR: z.string().default("data/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().min(1).default(10),

  // auto = SMTP when SMTP_HOST is set, otherwise the console/outbox fallback (development and tests only).
  MAIL_TRANSPORT: z.enum(["auto", "console", "smtp", "none"]).default("auto"),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: bool.default(false), // true = implicit TLS (port 465); false = STARTTLS when offered (587)
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default("MASAR <no-reply@masar.local>"),

  // Who may supply the client address through X-Forwarded-For (see parseTrustProxy above). Parsed: false | true | string[].
  TRUST_PROXY: trustProxy,
  // Test-only control plane (/__control/*) used by the e2e suite. Never enabled in production.
  ENABLE_TEST_CONTROLS: bool.default(false),
});

/** Parse + normalise. `source` is injectable so tests can build isolated configs. */
export function loadEnv(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === "production";
  const mailTransport = env.MAIL_TRANSPORT === "auto" ? (env.SMTP_HOST ? "smtp" : "console") : env.MAIL_TRANSPORT;

  if (isProd && env.SIGNING_SECRET.length < 32) {
    throw new Error("SIGNING_SECRET must be set (>= 32 chars) in production.");
  }
  if (isProd && env.ENABLE_TEST_CONTROLS) {
    throw new Error("ENABLE_TEST_CONTROLS must not be enabled in production.");
  }
  if (isProd && !/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
    throw new Error("DATABASE_URL (postgres://…) is required in production.");
  }
  if (mailTransport === "smtp" && !env.SMTP_HOST) {
    throw new Error("SMTP_HOST is required when MAIL_TRANSPORT=smtp.");
  }
  if (isProd && mailTransport === "console") {
    // Verification codes are delivered by e-mail only; the console fallback would print them to the logs.
    throw new Error("SMTP_HOST (and SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM) must be configured in production.");
  }

  return {
    ...env,
    isProd,
    isTest: env.NODE_ENV === "test",
    mailTransport,
    // A fixed dev/test secret keeps local codes verifiable across restarts; production requires a real one.
    signingSecret: env.SIGNING_SECRET || "dev-only-signing-secret-change-me-0123456789",
    uploadDir: path.resolve(BACKEND_ROOT, env.UPLOAD_DIR),
    maxUploadBytes: Math.floor(env.MAX_UPLOAD_MB * 1024 * 1024),
  };
}
