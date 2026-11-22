// scrypt password hashing (node:crypto, no native dependency).
// Stored format: scrypt$<log2 N>$<r>$<p>$<salt b64>$<hash b64> — parameters travel with the hash,
// so the cost can be raised later and old hashes still verify.
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const R = 8;
const P = 1;
const KEYLEN = 32;
const maxmemFor = (N) => 128 * N * R * 2;

export const PASSWORD_MAX_LENGTH = 128; // bounds the work an attacker can force per request

export async function hashPassword(password, { logN = 15 } = {}) {
  const N = 2 ** logN;
  const salt = randomBytes(16);
  const hash = await scryptAsync(String(password), salt, KEYLEN, { N, r: R, p: P, maxmem: maxmemFor(N) });
  return ["scrypt", logN, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string" || typeof password !== "string") return false;
  if (password.length > PASSWORD_MAX_LENGTH) return false;
  const [scheme, logN, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !hashB64) return false;
  const N = 2 ** Number(logN);
  const expected = Buffer.from(hashB64, "base64");
  try {
    const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length, {
      N,
      r: Number(r),
      p: Number(p),
      maxmem: maxmemFor(N),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
