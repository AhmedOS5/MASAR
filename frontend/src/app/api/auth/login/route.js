import { NextResponse } from "next/server";
import { apiBase, configError, UPSTREAM_TIMEOUT_MS } from "@/lib/server/config";
import { forwardedFor } from "@/lib/server/client-ip";
import { crossSiteResponse, isSameSiteRequest } from "@/lib/server/csrf";
import {
  AUTH_COOKIE,
  STATUS_COOKIE,
  cookieOptions,
  homeForStatus,
  statusForUser,
} from "@/lib/session";

export const dynamic = "force-dynamic";

async function fetchMe(base, token, forwarded) {
  try {
    const res = await fetch(`${base}/auth/me`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...forwarded },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function POST(request) {
  if (!isSameSiteRequest(request)) return crossSiteResponse(); // login CSRF: never sign a victim into the attacker's account
  const base = apiBase();
  if (!base) return configError();

  const body = await request.json().catch(() => null);
  const email = body?.email?.trim?.();
  const password = body?.password;
  if (!email || !password) {
    return NextResponse.json(
      { message: "البريد الإلكتروني وكلمة المرور مطلوبان." },
      { status: 422 },
    );
  }

  // The backend throttles logins per client address: it must see the visitor's, not this server's.
  const forwarded = forwardedFor(request);

  let res;
  try {
    res = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...forwarded },
      body: JSON.stringify({ admin_email: email, admin_password: password }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json(
      { message: "تعذر الاتصال بالخادم، حاول لاحقاً." },
      { status: 502 },
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  const token = data.token ?? data.access_token ?? data.data?.token;
  if (!token) {
    return NextResponse.json(
      { message: "استجابة تسجيل الدخول لا تحتوي على رمز دخول." },
      { status: 502 },
    );
  }

  let user = data.user ?? data.data?.user ?? null;
  let rawStatus =
    user?.onboarding_status ?? data.onboarding_status ?? data.data?.onboarding_status;

  if (rawStatus === undefined) {
    const me = await fetchMe(base, token, forwarded);
    user = me?.user ?? user;
    rawStatus = me?.user?.onboarding_status ?? me?.onboarding_status;
  }

  const status = statusForUser(user, rawStatus);
  const response = NextResponse.json({
    user,
    onboarding_status: status,
    redirect: homeForStatus(status),
  });

  const opts = cookieOptions({ remember: body.remember === true });
  response.cookies.set(AUTH_COOKIE, token, opts);
  response.cookies.set(STATUS_COOKIE, status, opts);
  return response;
}
