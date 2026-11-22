import { NextResponse } from "next/server";
import { AUTH_COOKIE, STATUS_COOKIE } from "@/lib/session";
import { evaluateAccess } from "@/lib/access";

/**
 * Route guard (Next.js 16 "proxy", formerly "middleware").
 * Cookies are HttpOnly and written only by /api/auth/login | session | organization/o.
 * This is a UX guard; the Laravel API remains the authority and must itself
 * reject unauthenticated requests.
 */
export function proxy(request) {
  const { pathname } = request.nextUrl;
  const decision = evaluateAccess({
    pathname,
    token: request.cookies.get(AUTH_COOKIE)?.value,
    rawStatus: request.cookies.get(STATUS_COOKIE)?.value,
  });

  if (!decision) return NextResponse.next();

  const url = new URL(decision.redirect, request.url);
  if (decision.withNext) url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/operator/:path*"],
};
