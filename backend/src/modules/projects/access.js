// Who may touch which project. The job-category package says WHAT a person may do (view / edit per area); project
// membership says WHERE. Every request, task, folder, file and report belongs to a project — there is no organization-wide work.
//
//   full access  = the system admin, or anyone holding `projects.manage`: every project of the organization;
//   supervisor   = a member the admin made supervisor: also approves the project's requests and directs others' tasks;
//   member       = works inside the project;  anyone else: the project does not exist for them (404, never 403).
import { ValidationError, forbidden, notFound } from "../../lib/errors.js";
import { usersWithPermission } from "../auth/members.js";

export const PROJECT_ROLES = ["supervisor", "member"];
export const hasFullProjectAccess = (auth) => auth.isSystemAdmin || auth.can("projects.manage");

/** The caller's role in a project: "admin" (full access), "supervisor", "member", or null (no access / no such project). */
export async function projectRoleOf(db, auth, projectId) {
  const project = await db("projects").where({ id: projectId, organization_id: auth.organizationId }).first("id");
  if (!project) return null;
  if (hasFullProjectAccess(auth)) return "admin";
  const m = await db("project_members").where({ project_id: projectId, user_id: auth.userId }).first("project_role");
  return m?.project_role ?? null;
}

/**
 * Throws 404 unless the caller may work in the project; with `{ supervisor: true }` a plain member gets 403 instead
 * (they can see the project, just not do this). Returns the caller's role.
 */
export async function assertProjectAccess(db, auth, projectId, { supervisor = false } = {}) {
  const role = await projectRoleOf(db, auth, projectId);
  if (!role) throw notFound("المشروع غير موجود.");
  if (supervisor && role === "member") throw forbidden();
  return role;
}

/** Ids of everyone who works in the project: its team plus the people with full project access (a Set). */
export async function usersOnProject(db, organizationId, projectId) {
  const [team, full] = await Promise.all([db("project_members").where({ project_id: projectId }).pluck("user_id"), usersWithPermission(db, organizationId, "projects.manage")]);
  return new Set([...team, ...full]);
}

/** Ids of the projects the caller belongs to, or null when they may see all of them. */
export async function visibleProjectIds(db, auth) {
  if (hasFullProjectAccess(auth)) return null;
  return db("project_members as m")
    .join("projects as p", "p.id", "m.project_id")
    .where({ "m.user_id": auth.userId, "p.organization_id": auth.organizationId })
    .pluck("m.project_id");
}

/** Restrict a query on `column` (a project_id) to the projects in `ids` (from visibleProjectIds). `null` = no limit. */
export const scopeIds = (qb, ids, column) => (ids === null ? qb : qb.whereIn(column, ids));

/** The `project_id` query filter: a number narrows to that project, anything else matches nothing. */
export function filterProject(qb, value, column) {
  const id = Number(value);
  return Number.isInteger(id) ? qb.where(column, id) : qb.whereRaw("1 = 0");
}

/** Throws 404 when a row's project is out of the caller's reach. Returns the caller's role in it. */
export const assertRowAccess = (db, auth, projectId, opts) => assertProjectAccess(db, auth, projectId, opts);

/** A project is mandatory: it must be given, exist in the caller's organization, and the caller must work in it (422 on `project_id`). */
export async function resolveProjectField(db, auth, projectId) {
  if (projectId == null) throw new ValidationError({ project_id: ["المشروع مطلوب."] });
  const role = await projectRoleOf(db, auth, projectId);
  if (!role) throw new ValidationError({ project_id: ["المشروع المحدد غير موجود أو لا تملك الوصول إليه."] });
  return projectId;
}
