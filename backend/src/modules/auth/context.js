// How a user row becomes the request's auth context and the public user payload.
import { PERMISSION_KEYS } from "./permissions.js";
import { bool, iso } from "../../lib/time.js";

export const PLATFORM_ADMIN_ROLE = "مشرف المنصة";
export const DEFAULT_ROLE_LABEL = "عضو";

/** Columns shared by every "user + role + organization" lookup (token auth, login, me). */
export const USER_CONTEXT_COLUMNS = [
  "u.id as user_id",
  "u.name",
  "u.email",
  "u.phone",
  "u.department",
  "u.status as user_status",
  "u.is_platform_admin",
  "u.email_verified_at",
  "u.password_hash",
  "u.organization_id",
  "u.role_id",
  "r.title as role_title",
  "r.is_system_admin",
  "o.name as org_name",
  "o.type as org_type",
  "o.email as org_email",
  "o.phone as org_phone",
  "o.status as org_status",
];

export const userContextQuery = (db) =>
  db("users as u")
    .leftJoin("roles as r", "r.id", "u.role_id")
    .leftJoin("organizations as o", "o.id", "u.organization_id");

/** Organization states in which a member may hold a session at all. */
export const ORG_BLOCKED = new Set(["rejected", "suspended"]);

/** Value of `onboarding_status` the frontend normalises (see src/lib/session.js). */
export function onboardingStatus(row) {
  if (bool(row.is_platform_admin)) return "approved";
  switch (row.org_status) {
    case "approved":
      return "approved";
    case "pending_approval":
      return "pending_approval";
    default:
      return "incomplete";
  }
}

export async function loadPermissions(db, row) {
  if (bool(row.is_platform_admin)) return new Set();
  if (bool(row.is_system_admin)) return new Set(PERMISSION_KEYS);
  if (!row.role_id) return new Set();
  const keys = await db("role_permissions").where({ role_id: row.role_id }).pluck("permission_key");
  return new Set(keys.filter((k) => PERMISSION_KEYS.has(k)));
}

/** Per-request context attached as `request.auth`. */
export function toAuthContext(row, permissions, tokenId = null) {
  const platformAdmin = bool(row.is_platform_admin);
  return {
    tokenId,
    userId: row.user_id,
    organizationId: row.organization_id ?? null,
    isPlatformAdmin: platformAdmin,
    isSystemAdmin: bool(row.is_system_admin),
    approved: platformAdmin || row.org_status === "approved",
    permissions,
    can: (key) => permissions.has(key),
    user: {
      id: row.user_id,
      name: row.name,
      email: row.email,
      phone: row.phone ?? null,
      department: row.department ?? null,
      roleId: row.role_id ?? null,
      roleTitle: platformAdmin ? PLATFORM_ADMIN_ROLE : (row.role_title ?? DEFAULT_ROLE_LABEL),
    },
    org: row.organization_id
      ? { id: row.organization_id, name: row.org_name, type: row.org_type, email: row.org_email, phone: row.org_phone ?? "", status: row.org_status }
      : null,
    onboardingStatus: onboardingStatus(row),
  };
}

/** The `user` object of /login and /auth/me responses. */
export function publicUser(ctx) {
  return {
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    role: ctx.user.roleTitle,
    onboarding_status: ctx.onboardingStatus,
    is_system_admin: ctx.isSystemAdmin,
    // Platform operators belong to no organization: the frontend sends them to the operator page, not the dashboard.
    is_platform_admin: ctx.isPlatformAdmin,
    permissions: [...ctx.permissions].sort(),
  };
}

export const publicOrganization = (org) =>
  org ? { id: org.id, name: org.name, type: org.type, email: org.email, phone: org.phone ?? "" } : null;

export const verifiedAt = (row) => iso(row.email_verified_at);
