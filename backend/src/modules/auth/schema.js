import { z, text, optText, email, flag } from "../../lib/validate.js";
import { PASSWORD_MAX_LENGTH } from "../../lib/password.js";
import { OTP_LENGTH } from "../../lib/otp.js";

// Mirrors the list in the frontend's RegisterForm (UX check there, authoritative check here).
export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "yahoo.co.uk", "hotmail.com", "hotmail.co.uk",
  "outlook.com", "live.com", "msn.com", "aol.com", "icloud.com", "me.com", "mac.com", "mail.com",
  "yandex.com", "protonmail.com", "proton.me", "zoho.com", "gmx.com",
]);

export const emailDomain = (address) => String(address).split("@")[1]?.toLowerCase() ?? "";

/** >= 8 chars, a digit and a symbol (same rules the form shows). */
export const passwordPolicy = z
  .string()
  .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل.")
  .max(PASSWORD_MAX_LENGTH, `كلمة المرور يجب ألا تزيد عن ${PASSWORD_MAX_LENGTH} حرفاً.`)
  .regex(/[0-9]/, "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل.")
  .regex(/[^\p{L}\p{N}\s]/u, "كلمة المرور يجب أن تحتوي على رمز خاص واحد على الأقل.");

// "ngo" at registration, "NGO | Gov | Company | INGO" at onboarding: one case-insensitive enum.
export const orgType = z.preprocess(
  (v) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : undefined),
  z.enum(["ngo", "ingo", "gov", "company"]).default("ngo"),
);

export const registerSchema = z
  .object({
    organization_name: text(255),
    organization_email: email().refine((v) => !FREE_EMAIL_DOMAINS.has(emailDomain(v)), {
      message: "يرجى استخدام بريد مؤسسة رسمي (غير مسموح ببريد مجاني Gmail/Yahoo).",
    }),
    admin_email: email(),
    admin_name: optText(255),
    organization_region: text(255),
    organization_phone: text(50).refine((v) => v.length >= 8, { message: "يرجى إدخال رقم جوال صالح." }),
    admin_password: passwordPolicy,
    admin_password_confirmation: z.string().optional(),
    organization_type: orgType,
    agreed_to_terms: flag().refine((v) => v === true, { message: "يجب الموافقة على الشروط والأحكام." }),
  })
  .superRefine((d, ctx) => {
    // Laravel's `confirmed` rule reports on the password field itself.
    if (d.admin_password !== d.admin_password_confirmation) {
      ctx.addIssue({ code: "custom", path: ["admin_password"], message: "كلمتا المرور غير متطابقتين." });
    }
  });

export const loginSchema = z.object({
  admin_email: email(),
  admin_password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

/** The 6-digit code: digits only. Spaces are tolerated (pasted "123 456"); a JSON number is zero-padded back to 6 digits. */
export const otpCode = z.preprocess(
  (v) => (typeof v === "number" && Number.isInteger(v) ? String(v).padStart(OTP_LENGTH, "0") : typeof v === "string" ? v.replace(/\s+/g, "") : v),
  z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `الرمز يتكون من ${OTP_LENGTH} أرقام.`),
);

export const verifyEmailSchema = z.object({ email: email(), code: otpCode });

export const forgotPasswordSchema = z.object({ email: email() });

/**
 * Choosing a password with an e-mailed code: an invited employee (set-password) or someone who forgot theirs
 * (reset-password). The code proves the e-mail, the policy is the registration one.
 */
export const setPasswordSchema = z
  .object({
    email: email(),
    code: otpCode,
    password: passwordPolicy,
    password_confirmation: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.password !== d.password_confirmation) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "كلمتا المرور غير متطابقتين." });
    }
  });
export const resetPasswordSchema = setPasswordSchema;

/** A signed-in user chooses a new password: the current one proves it is really them (not just a stolen session). */
export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "كلمة المرور الحالية مطلوبة.").max(PASSWORD_MAX_LENGTH),
    password: passwordPolicy,
    password_confirmation: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.password !== d.password_confirmation) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "كلمتا المرور غير متطابقتين." });
    } else if (d.password === d.current_password) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "كلمة المرور الجديدة يجب أن تختلف عن الحالية." });
    }
  });
export const resendSchema = z.object({ email: email() });
