// Questions about who may do what inside an organization (used to address notifications).

/** Ids of the organization's active users who hold `permissionKey` (system admins hold every permission). */
export function usersWithPermission(db, organizationId, permissionKey) {
  return db("users as u")
    .leftJoin("roles as r", "r.id", "u.role_id")
    .where({ "u.organization_id": organizationId, "u.status": "active" })
    .where((w) =>
      w
        .where("r.is_system_admin", true)
        .orWhereIn("u.role_id", db("role_permissions").select("role_id").where("permission_key", permissionKey)),
    )
    .pluck("u.id");
}

/** Active user of this organization, or undefined. */
export const activeMember = (db, organizationId, userId) =>
  db("users").where({ id: userId, organization_id: organizationId, status: "active" }).first("id", "name");
