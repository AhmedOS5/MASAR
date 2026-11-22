// Tiny in-memory sliding-window counter for per-identity throttling (e.g. failed logins per e-mail).
// The IP-level limits come from @fastify/rate-limit; this covers dimensions it cannot see in onRequest
// (the e-mail in the body). In-memory => per process; use a shared store if you run several instances.
import { HttpError } from "./errors.js";

export function createLimiter() {
  const hits = new Map(); // key -> number[] (timestamps)

  const live = (key, windowMs, now = Date.now()) => {
    const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length) hits.set(key, arr);
    else hits.delete(key);
    return arr;
  };

  const timer = setInterval(() => {
    for (const key of hits.keys()) live(key, 3_600_000);
  }, 60_000);
  timer.unref();

  return {
    /** Throws 429 when `key` already has >= max hits inside the window. */
    assert(key, max, windowMs) {
      if (live(key, windowMs).length >= max) throw new HttpError(429);
    },
    /** Milliseconds until the oldest live hit leaves the window (0 when there is none) — for "try again in N s". */
    retryAfterMs(key, windowMs) {
      const arr = live(key, windowMs);
      return arr.length ? Math.max(0, windowMs - (Date.now() - arr[0])) : 0;
    },
    hit(key, windowMs) {
      const arr = live(key, windowMs);
      arr.push(Date.now());
      hits.set(key, arr);
    },
    reset(key) {
      hits.delete(key);
    },
    /** Forget everything (test control plane). */
    clear() {
      hits.clear();
    },
    close() {
      clearInterval(timer);
    },
  };
}
