// Shared by the screens where the user types an e-mailed 6-digit code (/verify-email, /set-password).
export const OTP_LENGTH = 6;

/** Keep digits only (also handles a pasted "123 456" or Arabic-Indic digits typed on a phone), capped at OTP_LENGTH. */
export const toOtpDigits = (value) =>
  String(value)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\D/g, "")
    .slice(0, OTP_LENGTH);
