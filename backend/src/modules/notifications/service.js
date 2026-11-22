// Creating notifications (reading/marking them is the notifications module in step 4).
import { nowIso } from "../../lib/time.js";

/** Notify specific users of an organization. `db` may be a transaction. */
export async function notifyUsers(db, { organizationId, userIds, title, message = null, type = "system", link = null }) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return 0;
  const created_at = nowIso();
  await db("notifications").insert(
    ids.map((user_id) => ({ organization_id: organizationId, user_id, title, message, type, link, is_read: false, created_at })),
  );
  return ids.length;
}

/** Notify every active member of an organization. */
export async function notifyOrganization(db, organizationId, payload) {
  const userIds = await db("users").where({ organization_id: organizationId, status: "active" }).pluck("id");
  return notifyUsers(db, { organizationId, userIds, ...payload });
}
