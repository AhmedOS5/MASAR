import { get, post } from "@/lib/http";

/** Sets the HttpOnly session cookie server-side; resolves { user, onboarding_status, redirect }. */
export const loginAdmin = ({ email, password, remember = false }) =>
  post("/auth/login", { email, password, remember }, { auth: false });

export const logout = () => post("/auth/logout", undefined, { auth: false });

/** { user, organization, onboarding_status } */
export const getSession = () => get("/auth/session");

/** Creates the organization + admin and e-mails a 6-digit verification code. */
export const registerOrganization = (payload) =>
  post("/auth/register", payload, { auth: false });

/**
 * Verifies the e-mail address with the 6-digit code that was e-mailed.
 * 200 -> { verified: true }. Wrong/expired code -> 422 (field error on `code`); after 5 wrong attempts -> 429
 * (a new code must be requested).
 */
export const verifyEmail = ({ email, code }) =>
  post("/auth/verify-email", { email, code }, { auth: false });

/**
 * An employee invited by an organization admin chooses their password with the invitation code that was e-mailed to them.
 * 200 -> { activated: true } (sign in afterwards). Wrong/expired code -> 422 (field error on `code`); weak or unconfirmed
 * password -> 422 (field error on `password`); after 5 wrong attempts -> 429 (an admin must send a new invitation).
 */
export const setPassword = ({ email, code, password, passwordConfirmation }) =>
  post("/auth/set-password", { email, code, password, password_confirmation: passwordConfirmation }, { auth: false });

/**
 * "I forgot my password": e-mails a 6-digit reset code if the address belongs to a verified, active account.
 * ALWAYS answers 200 { message, expires_in_minutes, resend_after_seconds } (the same for every address — it never says whether
 * the account exists); 429 during the cooldown ("يرجى الانتظار N ثانية…") or after 3 requests in 10 minutes.
 */
export const forgotPassword = (email) => post("/auth/forgot-password", { email }, { auth: false });

/**
 * Chooses a new password with the e-mailed reset code. 200 -> { reset: true } (every session is ended; sign in afterwards).
 * Wrong/expired code -> 422 (field error on `code`); weak or unconfirmed password -> 422 (field error on `password`);
 * after 5 wrong attempts -> 429 until a new code is requested; after 10 wrong attempts within an hour -> 429 for a while.
 */
export const resetPassword = ({ email, code, password, passwordConfirmation }) =>
  post("/auth/reset-password", { email, code, password, password_confirmation: passwordConfirmation }, { auth: false });

/**
 * A signed-in user changes their own password (needs the current one). 200 -> { changed: true } — this session stays
 * signed in, every other session of the user is ended. Wrong current password -> 422 (field error on `current_password`);
 * weak / unconfirmed / unchanged new password -> 422 (field error on `password`); after 5 wrong attempts -> 429 for 15 minutes.
 */
export const changePassword = ({ currentPassword, password, passwordConfirmation }) =>
  post("/auth/change-password", {
    current_password: currentPassword,
    password,
    password_confirmation: passwordConfirmation,
  });

/**
 * Invalidates the previous code and e-mails a new one.
 * -> { message, expires_in_minutes, resend_after_seconds }. 429 while the cooldown is running, 400 if already verified.
 */
export const resendVerificationCode = (email) =>
  post("/auth/resend-verification", { email }, { auth: false });
