// Cross-site request guard for the BFF. The auth cookie is SameSite=lax, which already keeps it off cross-site POSTs;
// this is the second layer (defence in depth): a state-changing request that a browser says came from another site is refused.
//
// Rule (only for methods that change state):
//   1. `Origin` present  -> its host must be the host the request was sent to.
//   2. else `Sec-Fetch-Site` present -> must be "same-origin" or "none" (the user typed it / a bookmark).
//   3. neither header     -> not a browser fetch (curl, server-to-server, tests): allowed. It carries no ambient cookies of a victim.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The host the browser addressed, honouring the reverse proxy's X-Forwarded-Host (first value). */
function requestHost(headers) {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return (forwarded || headers.get("host") || "").toLowerCase();
}

/** @returns {boolean} true when the request may proceed */
export function isSameSiteRequest(request) {
  if (SAFE_METHODS.has(request.method)) return true;
  const { headers } = request;

  const origin = headers.get("origin");
  if (origin !== null) {
    try {
      return new URL(origin).host.toLowerCase() === requestHost(headers);
    } catch {
      return false; // "null" (sandboxed iframe, file://) or garbage
    }
  }

  const site = headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin" || site === "none";

  return true;
}

/** A ready 403 response for a refused request. */
export const crossSiteResponse = () =>
  Response.json({ message: "طلب مرفوض: مصدر الطلب غير موثوق." }, { status: 403 });
