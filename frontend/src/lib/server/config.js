// Server-only configuration. Never import this from a client component.

/** Base URL of the backend API (Fastify), without trailing slash. */
export function apiBase() {
  const raw = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "";
  return raw.trim().replace(/\/+$/, "");
}

export const UPSTREAM_TIMEOUT_MS = 30_000;

export function configError() {
  return Response.json(
    { message: "الخادم غير مهيأ: متغير API_URL مفقود." },
    { status: 500 },
  );
}
