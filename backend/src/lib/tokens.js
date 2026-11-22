// Opaque bearer tokens: 256 bits of randomness, only the SHA-256 is persisted.
import { randomBytes, createHash } from "node:crypto";
import { nowIso } from "./time.js";

export const TOKEN_PREFIX = "mt_";

export const newToken = () => TOKEN_PREFIX + randomBytes(32).toString("base64url");
export const hashToken = (token) => createHash("sha256").update(String(token)).digest("hex");

/** Create a token row for a user and return the plaintext (shown to the caller exactly once). */
export async function issueToken(db, userId, ttlDays) {
  const token = newToken();
  const now = Date.now();
  // Housekeeping: drop this user's expired tokens whenever a new one is issued.
  await db("auth_tokens").where({ user_id: userId }).where("expires_at", "<", nowIso()).del();
  await db("auth_tokens").insert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: new Date(now + ttlDays * 86_400_000).toISOString(),
    created_at: new Date(now).toISOString(),
  });
  return token;
}

/** Extract the token from `Authorization: Bearer <token>`; null when absent/malformed. */
export function bearerFrom(request) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? "");
  return m ? m[1] : null;
}
