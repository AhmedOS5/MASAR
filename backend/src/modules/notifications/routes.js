// The signed-in user's own notifications. Nothing here can reach another user's rows.
import { notFound } from "../../lib/errors.js";
import { paginate, pageParams } from "../../lib/pagination.js";
import { paramId } from "../../lib/validate.js";
import { bool, iso } from "../../lib/time.js";

const toNotification = (n) => ({
  id: n.id,
  title: n.title,
  message: n.message,
  type: n.type,
  is_read: bool(n.is_read),
  created_at: iso(n.created_at),
  ...(n.link ? { link: n.link } : {}),
});

export default async function notificationRoutes(app) {
  const { db } = app;
  const guard = { preHandler: app.guard() };
  const mine = (auth) => db("notifications").where({ organization_id: auth.organizationId, user_id: auth.userId });

  app.get("/notifications", guard, async (request) => {
    const unread = Number((await mine(request.auth).where({ is_read: false }).count({ n: "*" }).first()).n);
    const qb = mine(request.auth).orderBy([{ column: "created_at", order: "desc" }, { column: "id", order: "desc" }]);
    return paginate(qb, pageParams(request.query), (rows) => rows.map(toNotification), { unread_count: unread });
  });

  app.patch("/notifications/:id/read", guard, async (request) => {
    const id = paramId(request.params.id);
    if (!(await mine(request.auth).where({ id }).first("id"))) throw notFound("الإشعار غير موجود.");
    await mine(request.auth).where({ id }).update({ is_read: true });
    return { ok: true };
  });

  app.post("/notifications/read-all", guard, async (request) => ({
    ok: true,
    updated: await mine(request.auth).where({ is_read: false }).update({ is_read: true }),
  }));
}
