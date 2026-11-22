import { NextResponse } from "next/server";
import { apiBase, configError, UPSTREAM_TIMEOUT_MS } from "@/lib/server/config";
import { forwardedFor } from "@/lib/server/client-ip";
import {
  AUTH_COOKIE,
  STATUS_COOKIE,
  cookieOptions,
  statusForUser,
} from "@/lib/session";

export const dynamic = "force-dynamic";

/** Current user + organization + onboarding status (refreshes the status cookie). */
export async function GET(request) {
  const base = apiBase();
  if (!base) return configError();

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ message: "غير مصرّح." }, { status: 401 });
  }

  let res;
  try {
    res = await fetch(`${base}/auth/me`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...forwardedFor(request) },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json({ message: "تعذر الاتصال بالخادم." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    const out = NextResponse.json(data, { status: 401 });
    out.cookies.delete(AUTH_COOKIE);
    out.cookies.delete(STATUS_COOKIE);
    return out;
  }
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  const user = data.user ?? data.data?.user ?? data.data ?? null;
  const organization = data.organization ?? user?.organization ?? null;
  const status = statusForUser(user, user?.onboarding_status ?? data.onboarding_status);

  const out = NextResponse.json({ user, organization, onboarding_status: status });
  out.cookies.set(STATUS_COOKIE, status, cookieOptions({ remember: true }));
  return out;
}
