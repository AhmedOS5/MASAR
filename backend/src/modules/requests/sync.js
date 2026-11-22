// A request follows its linked tasks:  approved --(first task)--> in_progress --(all tasks done)--> completed
// and back to in_progress when a finished task is reopened. Called inside the transaction that changed a task.
import { nowIso } from "../../lib/time.js";

export async function syncRequestProgress(trx, organizationId, requestId, actorId = null) {
  if (!requestId) return;
  const req = await trx("requests").where({ id: requestId, organization_id: organizationId }).first("id", "status");
  if (!req || !["approved", "in_progress", "completed"].includes(req.status)) return;

  const total = Number((await trx("tasks").where({ request_id: requestId }).count({ n: "*" }).first()).n);
  if (total === 0) return;
  const open = Number((await trx("tasks").where({ request_id: requestId }).whereNot({ status: "done" }).count({ n: "*" }).first()).n);

  const next = open === 0 ? "completed" : "in_progress";
  if (next === req.status) return;

  const now = nowIso();
  await trx("requests").where({ id: requestId }).update({ status: next, updated_at: now });
  await trx("request_activities").insert({
    request_id: requestId,
    actor_id: actorId,
    kind: "reviewed",
    text: next === "completed" ? "اكتملت جميع المهام المرتبطة وأصبح الطلب مكتملاً." : "بدأ تنفيذ الطلب عبر المهام المرتبطة.",
    created_at: now,
  });
}
