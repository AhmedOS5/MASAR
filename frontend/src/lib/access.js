import {
  ONBOARDING,
  homeForStatus,
  normalizeOnboardingStatus,
} from "@/lib/session";

/**
 * Pure access decision used by src/proxy.js (unit-tested).
 *   /dashboard/**   -> requires a session AND an approved organization
 *   /onboarding/**  -> requires a session; routes by onboarding status
 *   /operator/**    -> requires a session of a platform operator (the only screen they have)
 * Platform operators belong to no organization, so the dashboard and onboarding are closed to them.
 * Returns null (allow) or { redirect, withNext? }.
 */
export function evaluateAccess({ pathname, token, rawStatus }) {
  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  const isOperator = pathname === "/operator" || pathname.startsWith("/operator/");
  if (!isDashboard && !isOnboarding && !isOperator) return null;

  if (!token) return { redirect: "/login", withNext: true };

  const status = normalizeOnboardingStatus(rawStatus);
  const home = homeForStatus(status);

  if (status === ONBOARDING.OPERATOR) return isOperator ? null : { redirect: home };
  if (isOperator) return { redirect: home }; // everyone else has no business on the operator page

  if (isDashboard && status !== ONBOARDING.APPROVED) return { redirect: home };

  if (isOnboarding) {
    if (status === ONBOARDING.APPROVED) return { redirect: "/dashboard" };
    if (status === ONBOARDING.PENDING_APPROVAL && pathname !== home) {
      return { redirect: home };
    }
    if (status === ONBOARDING.PENDING_ONBOARDING && pathname !== "/onboarding") {
      return { redirect: "/onboarding" };
    }
  }
  return null;
}
