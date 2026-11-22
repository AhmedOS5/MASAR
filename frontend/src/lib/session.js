// Shared (server + client + proxy) session constants & helpers.
// The auth token itself lives ONLY in an HttpOnly cookie set by /api/auth/login.

export const AUTH_COOKIE = "auth_token";
export const STATUS_COOKIE = "onboarding_status";

export const ONBOARDING = {
  PENDING_ONBOARDING: "pending_onboarding",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  // A platform operator (staff of the platform itself, no organization): has no dashboard, only the operator page.
  OPERATOR: "operator",
};

const APPROVED_VALUES = ["approved", "completed", "active", "verified"];
const PENDING_APPROVAL_VALUES = [
  "pending_approval",
  "under_review",
  "submitted",
  "in_review",
  "pending",
];
const PENDING_ONBOARDING_VALUES = [
  "pending_onboarding",
  "incomplete",
  "draft",
  "not_started",
  "onboarding",
];

/** Map whatever the backend sends to one of ONBOARDING.* (missing => approved). */
export function normalizeOnboardingStatus(raw) {
  if (raw === undefined || raw === null || raw === "") return ONBOARDING.APPROVED;
  const v = String(raw).toLowerCase();
  if (v === ONBOARDING.OPERATOR || v === "platform_admin") return ONBOARDING.OPERATOR;
  if (APPROVED_VALUES.includes(v)) return ONBOARDING.APPROVED;
  if (PENDING_APPROVAL_VALUES.includes(v)) return ONBOARDING.PENDING_APPROVAL;
  if (PENDING_ONBOARDING_VALUES.includes(v)) return ONBOARDING.PENDING_ONBOARDING;
  return ONBOARDING.PENDING_ONBOARDING;
}

/**
 * The status the UI routes on. A platform operator is recognised by the backend's `is_platform_admin` flag (their
 * organization status is meaningless), everyone else by the onboarding status the backend reports.
 */
export function statusForUser(user, rawStatus) {
  if (user?.is_platform_admin === true) return ONBOARDING.OPERATOR;
  return normalizeOnboardingStatus(rawStatus);
}

/** Where a user in a given onboarding state belongs. */
export function homeForStatus(status) {
  switch (status) {
    case ONBOARDING.OPERATOR:
      return "/operator";
    case ONBOARDING.PENDING_ONBOARDING:
      return "/onboarding";
    case ONBOARDING.PENDING_APPROVAL:
      return "/onboarding/waiting-approval";
    default:
      return "/dashboard";
  }
}

/** Only allow same-site relative redirects (prevents open redirect via ?next=). */
export function safeNextPath(next, fallback = "/dashboard") {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}

export function cookieOptions({ remember = false } = {}) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: 60 * 60 * 24 * 30 } : {}),
  };
}
