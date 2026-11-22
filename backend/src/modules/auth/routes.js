import { parse } from "../../lib/validate.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendSchema,
  resetPasswordSchema,
  setPasswordSchema,
  verifyEmailSchema,
} from "./schema.js";
import { publicOrganization, publicUser } from "./context.js";

// Per-IP ceilings (per-identity limits live in service.js). Multiplied by RATE_LIMIT_SCALE.
const ipLimit = (app, max, minutes) => ({
  config: { rateLimit: { max: max * app.config.RATE_LIMIT_SCALE, timeWindow: `${minutes} minutes` } },
});

export default async function authRoutes(app) {
  const auth = app.authService;

  // ------------------------------------------------------------------ public
  // POST /auth/register is the primary path; /register-organization is kept as an alias (original frontend contract).
  const register = async (request, reply) => {
    const input = parse(registerSchema, request.body);
    await auth.register(input);
    // The verification code is only ever e-mailed (and, outside production, printed to the server console) — never returned.
    return reply.status(201).send({
      message: "تم إنشاء الحساب. أرسلنا رمز التحقق المكوّن من 6 أرقام إلى بريدك الإلكتروني.",
      expires_in_minutes: app.config.EMAIL_OTP_TTL_MINUTES,
    });
  };
  for (const path of ["/auth/register", "/register-organization"]) app.post(path, ipLimit(app, 10, 10), register);

  app.post("/auth/verify-email", ipLimit(app, 30, 10), async (request) => auth.verifyEmail(parse(verifyEmailSchema, request.body)));

  // An employee invited by an organization admin chooses their password with the e-mailed invitation code.
  app.post("/auth/set-password", ipLimit(app, 30, 10), async (request) => auth.setPassword(parse(setPasswordSchema, request.body)));

  // "Forgot my password": always the same answer; a reset code is e-mailed only to a verified, active account with a password.
  app.post("/auth/forgot-password", ipLimit(app, 10, 10), async (request) => auth.forgotPassword(parse(forgotPasswordSchema, request.body).email));
  app.post("/auth/reset-password", ipLimit(app, 30, 10), async (request) => auth.resetPassword(parse(resetPasswordSchema, request.body)));

  app.post("/auth/resend-verification", ipLimit(app, 10, 10), async (request) => {
    const { email } = parse(resendSchema, request.body);
    return auth.resend(email);
  });

  app.post("/login", ipLimit(app, 30, 5), async (request) => {
    const input = parse(loginSchema, request.body);
    const { token, ctx } = await auth.login(input);
    return { token, user: publicUser(ctx) };
  });

  // ------------------------------------------------------------ authenticated
  app.get("/auth/me", { preHandler: app.guard({ allowUnapproved: true }) }, async (request) => {
    const ctx = request.auth;
    return { user: publicUser(ctx), organization: publicOrganization(ctx.org) };
  });

  app.post("/logout", { preHandler: app.guard({ allowUnapproved: true }) }, async (request) => {
    await auth.logout(request.auth.tokenId);
    return { ok: true };
  });
}
