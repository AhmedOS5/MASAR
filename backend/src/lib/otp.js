// 6-digit e-mail verification codes (OTP).
//  * generated with the OS CSPRNG (crypto.randomInt: uniform, no modulo bias), zero-padded ("004217")
//  * never stored in clear text: only a keyed hash HMAC-SHA256(server secret, userId . code). A plain SHA-256 of a
//    6-digit number could be brute-forced offline from a leaked table in milliseconds; the secret prevents that.
//  * compared in constant time
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_LENGTH = 6;

export const generateOtp = () => String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");

export const hashOtp = (secret, userId, code) =>
  createHmac("sha256", secret).update(`email-otp.${userId}.${code}`).digest("hex");

export function otpMatches(secret, userId, code, storedHash) {
  const actual = Buffer.from(hashOtp(secret, userId, String(code)), "hex");
  const expected = Buffer.from(String(storedHash ?? ""), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
