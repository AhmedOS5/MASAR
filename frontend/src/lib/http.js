// Single browser-side HTTP client. All calls go to the same-origin BFF (/api/*),
// which attaches the HttpOnly auth cookie as a Bearer token for the backend API.

export class ApiError extends Error {
  constructor(status, message, fieldErrors = {}, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.data = data;
  }
}

const BASE = "/api";
let redirecting = false;

/** Backend validation errors => { field: "first message" } */
export function toFieldErrors(errors) {
  if (!errors || typeof errors !== "object") return {};
  const out = {};
  for (const [key, val] of Object.entries(errors)) {
    out[key] = Array.isArray(val) ? val[0] : String(val);
  }
  return out;
}

function buildQuery(query) {
  if (!query) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "" || v === "all") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function handleUnauthorized() {
  if (typeof window === "undefined" || redirecting) return;
  redirecting = true;
  try {
    await fetch(`${BASE}/auth/logout`, { method: "POST" });
  } catch {
    /* ignore */
  }
  const next = encodeURIComponent(window.location.pathname);
  window.location.assign(`/login?next=${next}`);
}

/**
 * @param {string} path  e.g. "/requests" (leading slash)
 * @param {{method?:string, body?:any, query?:object, signal?:AbortSignal, auth?:boolean}} opts
 *   auth:false => a 401 is a normal error (login / register pages), no redirect.
 */
export async function http(path, opts = {}) {
  const { method = "GET", body, query, signal, auth = true } = opts;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;

  const headers = { Accept: "application/json" };
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(`${BASE}${path}${buildQuery(query)}`, {
      method,
      headers,
      body:
        body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal,
      credentials: "same-origin",
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError(0, "تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً.");
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && auth) handleUnauthorized();
    const fieldErrors = toFieldErrors(data?.errors);
    const message =
      Object.values(fieldErrors).join(" | ") ||
      data?.message ||
      `تعذر إتمام الطلب (الحالة ${res.status})`;
    throw new ApiError(res.status, message, fieldErrors, data);
  }

  return data;
}

/** Resource helpers: { data: [...], meta: {...} } or bare arrays/objects. */
export const unwrap = (res) =>
  res && typeof res === "object" && "data" in res && !Array.isArray(res)
    ? res.data
    : res;
export const metaOf = (res) => (res && res.meta ? res.meta : {});
export const listOf = (res) => {
  const d = unwrap(res);
  return Array.isArray(d) ? d : [];
};

export const get = (path, query, opts) => http(path, { ...opts, query });
export const post = (path, body, opts) => http(path, { ...opts, method: "POST", body });
export const patch = (path, body, opts) => http(path, { ...opts, method: "PATCH", body });
export const put = (path, body, opts) => http(path, { ...opts, method: "PUT", body });
export const del = (path, opts) => http(path, { ...opts, method: "DELETE" });
