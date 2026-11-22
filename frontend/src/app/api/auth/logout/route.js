import { NextResponse } from "next/server";
import { apiBase, UPSTREAM_TIMEOUT_MS } from "@/lib/server/config";
import { forwardedFor } from "@/lib/server/client-ip";
import { AUTH_COOKIE, STATUS_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const base = apiBase();

  // Best-effort token revocation on the backend; local logout never fails.
  if (token && base) {
    try {
      await fetch(`${base}/logout`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...forwardedFor(request) },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      /* ignore */
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(AUTH_COOKIE);
  response.cookies.delete(STATUS_COOKIE);
  return response;
}
