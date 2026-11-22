// GET /dashboard/summary — everything the home page shows, computed live from the organization's own data.
// Counts are organization-wide aggregates; the request/task LISTS are only returned to users who may view them.
import { iso } from "../../lib/time.js";
import { scopeIds, visibleProjectIds } from "../projects/access.js";
import { unitsFor, unitStatus } from "../units/routes.js";

const DAY = 86_400_000;
const count = async (qb) => Number((await qb.count({ n: "*" }).first()).n);
const dayKey = (value) => iso(value).slice(0, 10);

/** The last 7 UTC days, oldest first. */
function lastSevenDays(now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: 7 }, (_, i) => new Date(today - (6 - i) * DAY).toISOString().slice(0, 10));
}

const trend = (n, unit) => (n > 0 ? { trend_text: `+${n} ${unit}`, trend: "up" } : { trend_text: "بدون تغيير", trend: "neutral" });

export default async function dashboardRoutes(app) {
  const { db } = app;

  app.get("/dashboard/summary", { preHandler: app.guard() }, async (request) => {
    const auth = request.auth;
    const org = auth.organizationId;
    const now = Date.now();
    const weekAgo = new Date(now - 7 * DAY).toISOString();
    const monthAgo = new Date(now - 30 * DAY).toISOString();
    const days = lastSevenDays(new Date(now));
    const since = `${days[0]}T00:00:00.000Z`;

    // Qualified: several of the queries below join `users`, which also has an organization_id column.
    // Work inside a project is only counted/listed for its team (and people with full project access).
    const projectIds = await visibleProjectIds(db, auth);
    const requests = () => scopeIds(db("requests").where("requests.organization_id", org), projectIds, "requests.project_id");
    const tasks = () => scopeIds(db("tasks").where("tasks.organization_id", org), projectIds, "tasks.project_id");
    const canRequests = auth.can("requests.view");
    const canTasks = auth.can("tasks.view");

    const [activeUsers, newUsers, openTasks, newTasks, running, pending, unread, reqWeek, taskWeek, units, pendingRows, recentRows, taskRows] =
      await Promise.all([
        count(db("users").where({ organization_id: org, status: "active" })),
        count(db("users").where({ organization_id: org, status: "active" }).where("created_at", ">=", monthAgo)),
        count(tasks().whereNot({ status: "done" })),
        count(tasks().where("created_at", ">=", weekAgo)),
        count(requests().whereIn("status", ["approved", "in_progress"])),
        count(requests().where({ status: "pending" })),
        count(db("notifications").where({ organization_id: org, user_id: auth.userId, is_read: false })),
        requests().where("created_at", ">=", since).pluck("created_at"),
        tasks().where("created_at", ">=", since).pluck("created_at"),
        unitsFor(db, org),
        canRequests
          ? requests().where({ status: "pending" }).orderBy([{ column: "created_at", order: "desc" }, { column: "id", order: "desc" }]).limit(3).select("id", "title", "amount", "department", "created_at")
          : [],
        canRequests
          ? requests()
              .leftJoin("users as u", "u.id", "requests.requester_id")
              .orderBy([{ column: "requests.created_at", order: "desc" }, { column: "requests.id", order: "desc" }])
              .limit(4)
              .select("requests.id", "requests.code", "requests.title", "requests.status", "requests.priority", "requests.type", "requests.department", "requests.amount", "requests.created_at", "u.name as requester_name")
          : [],
        canTasks
          ? tasks()
              .whereNot({ "tasks.status": "done" })
              .leftJoin("users as u", "u.id", "tasks.assignee_id")
              .orderBy([{ column: "tasks.created_at", order: "desc" }, { column: "tasks.id", order: "desc" }])
              .limit(3)
              .select("tasks.id", "tasks.code", "tasks.title", "tasks.status", "u.name as assignee", "tasks.due_date")
          : [],
      ]);

    const perDay = (stamps) => {
      const m = Object.fromEntries(days.map((d) => [d, 0]));
      for (const s of stamps) {
        const k = dayKey(s);
        if (k in m) m[k] += 1;
      }
      return m;
    };
    const reqPerDay = perDay(reqWeek);
    const taskPerDay = perDay(taskWeek);

    return {
      data: {
        stats: {
          active_users: { value: activeUsers, ...trend(newUsers, "هذا الشهر") },
          open_tasks: { value: openTasks, ...trend(newTasks, "هذا الأسبوع") },
          running_operations: { value: running, trend_text: pending > 0 ? `${pending} بانتظار الموافقة` : "مستقر", trend: "neutral" },
          important_alerts: unread > 0 ? { value: unread, trend_text: "تتطلب إجراء", trend: "down" } : { value: 0, trend_text: "لا توجد تنبيهات", trend: "neutral" },
        },
        weekly_activity: days.map((date) => ({ date, requests: reqPerDay[date], tasks: taskPerDay[date] })),
        active_units: units.filter((u) => unitStatus(u) === "active").map((u) => ({ id: u.id, title: u.title, icon: u.icon })),
        pending_approvals: pendingRows.map((r) => ({ id: r.id, title: r.title, amount: r.amount, department: r.department, created_at: iso(r.created_at) })),
        recent_requests: recentRows.map((r) => ({
          id: r.id, code: r.code, title: r.title, status: r.status, priority: r.priority, type: r.type,
          department: r.department, amount: r.amount, requester: { name: r.requester_name }, created_at: iso(r.created_at),
        })),
        open_tasks: taskRows.map((t) => ({ id: t.id, code: t.code, title: t.title, status: t.status, assignee: t.assignee ?? null, due_date: t.due_date ?? null })),
      },
    };
  });
}
