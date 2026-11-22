// /meal/complaints — feedback & complaints mechanism (FCRM). Reporter identity and description are stored but never
// listed: the table and export only carry what the follow-up team needs.
import { ValidationError, notFound } from "../../lib/errors.js";
import { applySearch, hasFilter, pageParams, paginate } from "../../lib/pagination.js";
import { nextCode } from "../../lib/sequence.js";
import { toCsv } from "../../lib/csv.js";
import { sendBuffer } from "../../lib/http-files.js";
import { nowIso } from "../../lib/time.js";
import { paramId, parse } from "../../lib/validate.js";
import { activeMember, usersWithPermission } from "../auth/members.js";
import { assertRowAccess, filterProject, resolveProjectField, scopeIds, usersOnProject, visibleProjectIds } from "../projects/access.js";
import { notifyUsers } from "../notifications/service.js";
import { createComplaintSchema, updateComplaintSchema } from "./schema.js";
import { daysBetween, mealGuard, todayUtc } from "./guard.js";

const OPEN = ["new", "in_progress"];
const PRIORITY_AR = { low: "منخفضة", medium: "متوسطة", high: "عالية", sensitive: "حساسة" };
const STATUS_AR = { new: "جديدة", in_progress: "قيد المعالجة", resolved: "تم الحل", closed: "مغلقة" };

const toComplaint = (c) => ({
  id: c.id,
  code: c.code,
  type: c.type,
  project_id: c.project_id,
  project: c.project_name,
  region: c.region,
  channel: c.channel,
  priority: c.priority,
  status: c.status,
  owner: c.owner_id ? { id: c.owner_id, name: c.owner_name } : null,
  received_at: c.received_at,
});

export default async function complaintRoutes(app) {
  const { db } = app;
  const view = { preHandler: mealGuard(app, "meal.view") };
  const manage = { preHandler: mealGuard(app, "meal.manage") };

  const base = (org) =>
    db("complaints as c").leftJoin("users as o", "o.id", "c.owner_id").leftJoin("projects as pr", "pr.id", "c.project_id").where("c.organization_id", org);
  const COLUMNS = ["c.*", "o.name as owner_name", "pr.name as project_name"];

  /** `status=sensitive` is a pseudo-status: complaints whose priority is sensitive (any status). Only the caller's projects. */
  function filtered(auth, q, ids) {
    const qb = scopeIds(base(auth.organizationId), ids, "c.project_id");
    if (q.status === "sensitive") qb.where("c.priority", "sensitive");
    else if (hasFilter(q.status)) qb.where("c.status", String(q.status));
    if (hasFilter(q.project_id)) filterProject(qb, q.project_id, "c.project_id");
    for (const key of ["region", "priority"]) if (hasFilter(q[key])) qb.where(`c.${key}`, String(q[key]));
    return applySearch(qb, q.search, ["c.code", "c.type", "pr.name", "c.region"]);
  }
  const ordered = (qb) => qb.select(COLUMNS).orderBy([{ column: "c.received_at", order: "desc" }, { column: "c.id", order: "desc" }]);

  app.get("/meal/complaints", view, async (request) =>
    paginate(ordered(filtered(request.auth, request.query, await visibleProjectIds(db, request.auth))), pageParams(request.query), (rows) => rows.map(toComplaint)),
  );

  app.get("/meal/complaints/stats", view, async (request) => {
    const org = request.auth.organizationId;
    const ids = await visibleProjectIds(db, request.auth);
    const count = async (qb) => Number((await qb.count({ n: "*" }).first()).n);
    const own = () => scopeIds(db("complaints").where({ organization_id: org }), ids, "project_id");
    const [total, fresh, inProgress, resolved, sensitive, sensitiveOpen] = await Promise.all([
      count(own()),
      count(own().where({ status: "new" })),
      count(own().where({ status: "in_progress" })),
      count(own().where({ status: "resolved" })),
      count(own().where({ priority: "sensitive" })),
      count(own().where({ priority: "sensitive" }).whereIn("status", OPEN)),
    ]);
    return { data: { total, new: fresh, in_progress: inProgress, sensitive, resolved, sensitive_open: sensitiveOpen } };
  });

  app.get("/meal/complaints/insights", view, async (request) => {
    const ids = await visibleProjectIds(db, request.auth);
    const rows = await scopeIds(db("complaints").where({ organization_id: request.auth.organizationId }), ids, "project_id").select("status", "priority", "received_at");
    const open = rows.filter((r) => OPEN.includes(r.status));
    const closed = rows.length - open.length;
    const sensitiveOpen = open.filter((r) => r.priority === "sensitive").length;
    const stale = open.filter((r) => r.status === "new" && daysBetween(r.received_at) > 7).length;
    const avgAge = open.length ? open.reduce((s, r) => s + Math.max(0, daysBetween(r.received_at)), 0) / open.length : 0;
    const closeRate = rows.length ? Math.round((closed / rows.length) * 100) : null;

    const metrics = [
      { label: "الشكاوى المفتوحة", value: String(open.length), level: open.length ? "info" : "success" },
      { label: "نسبة الإغلاق", value: closeRate === null ? "—" : `${closeRate}%`, level: closeRate === null ? "info" : closeRate >= 70 ? "success" : closeRate >= 40 ? "warning" : "danger" },
      { label: "متوسط عمر الشكاوى المفتوحة", value: `${avgAge.toFixed(1)} يوم`, level: avgAge > 14 ? "danger" : avgAge > 7 ? "warning" : "success" },
      { label: "الشكاوى الحساسة المفتوحة", value: String(sensitiveOpen), level: sensitiveOpen ? "danger" : "success" },
    ];
    const alerts = [];
    if (sensitiveOpen) alerts.push({ text: `${sensitiveOpen} شكوى حساسة مفتوحة تحتاج متابعة فورية`, level: "danger" });
    if (stale) alerts.push({ text: `${stale} شكوى جديدة لم تُعالج منذ أكثر من 7 أيام`, level: "warning" });
    return { data: { metrics, alerts } };
  });

  app.get("/meal/complaints/export", view, async (request, reply) => {
    const rows = (await ordered(filtered(request.auth, request.query, await visibleProjectIds(db, request.auth))).limit(10_000)).map(toComplaint);
    const body = toCsv(rows, [
      { header: "الرمز", value: (r) => r.code },
      { header: "النوع", value: (r) => r.type },
      { header: "المشروع", value: (r) => r.project },
      { header: "المنطقة", value: (r) => r.region },
      { header: "قناة الاستلام", value: (r) => r.channel },
      { header: "الأولوية", value: (r) => PRIORITY_AR[r.priority] ?? r.priority },
      { header: "الحالة", value: (r) => STATUS_AR[r.status] ?? r.status },
      { header: "المسؤول", value: (r) => r.owner?.name },
      { header: "تاريخ الاستلام", value: (r) => r.received_at },
    ]);
    return sendBuffer(reply, { body, name: "complaints.csv", mime: "text/csv; charset=utf-8" });
  });

  app.post("/meal/complaints", manage, async (request, reply) => {
    const auth = request.auth;
    const input = parse(createComplaintSchema, request.body);
    const projectId = await resolveProjectField(db, auth, input.project_id); // a project the person works in
    const id = await db.transaction(async (trx) => {
      const code = await nextCode(trx, auth.organizationId, "complaint", "FCRM", { start: 900 });
      const now = nowIso();
      const [{ id: newId }] = await trx("complaints").insert(
        {
          organization_id: auth.organizationId,
          code,
          type: input.type,
          project_id: projectId,
          region: input.region ?? null,
          channel: input.channel,
          priority: input.priority,
          status: "new",
          owner_id: auth.userId, // the person who logs it follows it up until reassigned
          reporter_name: input.reporter_name ?? null,
          description: input.description ?? null,
          received_at: todayUtc(),
          created_at: now,
          updated_at: now,
        },
        ["id"],
      );
      return newId;
    });

    if (input.priority === "sensitive") {
      // the follow-up team of that project (never someone who cannot see it)
      const onProject = await usersOnProject(db, auth.organizationId, projectId);
      const managers = (await usersWithPermission(db, auth.organizationId, "meal.manage")).filter((u) => u !== auth.userId && onProject.has(u));
      const projectName = (await db("projects").where({ id: projectId }).first("name"))?.name;
      await notifyUsers(db, { organizationId: auth.organizationId, userIds: managers, title: "شكوى حساسة جديدة", message: `${input.type} — ${projectName}`, type: "alert", link: "/dashboard/meal/complaints" });
    }
    const created = await ordered(base(auth.organizationId).where("c.id", id)).first();
    return reply.status(201).send({ data: toComplaint(created) });
  });

  app.patch("/meal/complaints/:id", manage, async (request) => {
    const auth = request.auth;
    const id = paramId(request.params.id);
    const input = parse(updateComplaintSchema, request.body);
    const current = await db("complaints").where({ id, organization_id: auth.organizationId }).first("id", "project_id");
    if (!current) throw notFound("الشكوى غير موجودة.");
    await assertRowAccess(db, auth, current.project_id); // 404 outside the project's team
    if (input.owner_id != null && !(await activeMember(db, auth.organizationId, input.owner_id))) {
      throw new ValidationError({ owner_id: ["المسؤول المحدد غير موجود."] });
    }
    const patch = { updated_at: nowIso() };
    if (input.status !== undefined) patch.status = input.status;
    if (input.owner_id !== undefined) patch.owner_id = input.owner_id;
    await db("complaints").where({ id, organization_id: auth.organizationId }).update(patch);
    return { data: toComplaint(await ordered(base(auth.organizationId).where("c.id", id)).first()) };
  });
}
