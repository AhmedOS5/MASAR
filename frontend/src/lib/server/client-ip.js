// Server-only. The backend rate-limits per client address, but every request it receives comes from THIS server, so
// without help all visitors look like one address and share one limit. Route handlers therefore forward the visitor's
// address in X-Forwarded-For — and the backend believes it only from its own trusted proxy (backend TRUST_PROXY).
//
// Where does the visitor's address come from? From the X-Forwarded-For header that the reverse proxy in front of this
// server (Vercel, nginx, a load balancer …) APPENDS. A visitor can send a header of their own too, so a value is only
// believed when it was written by a proxy we trust: with N trusted proxies the address is the N-th entry from the RIGHT,
// everything to its left is client-supplied and ignored. N is TRUSTED_PROXY_HOPS:
//   0 (default)   this server is reached directly (local development): the header cannot be trusted, nothing is forwarded
//   1             one reverse proxy in front (Vercel — it is the default there — or nginx/ALB)
//   2             e.g. a CDN in front of a load balancer

import { isIP } from "node:net";

const MAX_HOPS = 10;

/** Number of trusted reverse proxies in front of this server (TRUSTED_PROXY_HOPS; defaults to 1 on Vercel, else 0). */
export function trustedProxyHops(env = process.env) {
  const raw = env.TRUSTED_PROXY_HOPS;
  if (raw !== undefined && String(raw).trim() !== "") {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= MAX_HOPS ? n : 0; // a typo must not enable trust
  }
  return env.VERCEL ? 1 : 0;
}

/** "203.0.113.7", "203.0.113.7:5521", "[2001:db8::1]:443", "2001:db8::1" -> the bare IP, or null if it is not one. */
export function normalizeIp(entry) {
  let value = String(entry ?? "").trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed) value = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) value = value.slice(0, value.lastIndexOf(":"));
  return isIP(value) ? value : null;
}

/**
 * The visitor's address as vouched for by the trusted proxies, or null (unknown: forward nothing).
 * @param {Headers} headers  the incoming request's headers
 */
export function clientIp(headers, hops = trustedProxyHops()) {
  if (!hops) return null;
  const chain = String(headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Fewer entries than trusted proxies means the request did not travel the path we expect: do not guess.
  if (chain.length < hops) return null;
  return normalizeIp(chain[chain.length - hops]);
}

/**
 * Headers to add to a call to the backend so it sees the visitor, not this server.
 * Always built from scratch — the incoming X-Forwarded-For is never passed through.
 */
export function forwardedFor(request) {
  const ip = clientIp(request.headers);
  return ip ? { "X-Forwarded-For": ip } : {};
}
