// /meal/reports — MEAL reports (workflow: draft → in_review → needs_edit | approved) and their on-demand document.
import { ValidationError, notFound } from "../../lib/errors.js";
import { applySearch, hasFilter, listOf, pageParams, paginate } from "../../lib/pagination.js";
import { toCsv } from "../../lib/csv.js";
import { sendBuffer } from "../../lib/http-files.js";
import { iso, nowIso } from "../../lib/time.js";
import { paramId, parse } from "../../lib/validate.js";
import { notifyUsers } from "../notifications/service.js";
import { assertRowAccess, filterProject, resolveProjectField, scopeIds, usersOnProject, visibleProjectIds } from "../projects/access.js";
import { createMealReportSchema, updateMealReportSchema } from "./schema.js";
import { daysBetween, mealGuard } from "./guard.js";
import { renderReportHtml } from "./report-html.js";

const STATUS_AR = { draft: "مسودة", in_review: "قيد المراجعة", needs_edit: "بحاجة تعديل", approved: "معتمد" };

const toReport = (r) => ({
  id: r.id,
  title: r.title,
  type: r.type,
  project_id: r.project_id,
  project: r.project_name,
  period: r.period,
  status: r.status,
  owner: r.owner_id ? { id: r.owner_id, name: r.owner_name } : null,
  updated_at: iso(r.updated_at),
});

export default async function mealReportRoutes(app) {
  const { db } = app;
  const view = { preHandler: mealGuard(app, "meal.view") };
  const manage = { preHandler: mealGuard(app, "meal.manage") };

  const base = (org) =>
    db("meal_reports as r").leftJoin("users as o", "o.id", "r.owner_id").leftJoin("projects as pr", "pr.id", "r.project_id").where("r.organization_id", org);
  const COLUMNS = ["r.*", "o.name as owner_name", "pr.name as project_name"];
  /** Only the reports of the caller's projects (`ids` from visibleProjectIds). */
  function filtered(auth, q, ids) {
    const qb = scopeIds(base(auth.organizationId), ids, "r.project_id");
    for (const key of ["status", "type", "period"]) if (hasFilter(q[key])) qb.where(`r.${key}`, String(q[key]));
    if (hasFilter(q.project_id)) filterProject(qb, q.project_id, "r.project_id");
    return applySearch(qb, q.search, ["r.title"]);
  }
  const ordered = (qb) => qb.select(COLUMNS).orderBy([{ column: "r.updated_at", order: "desc" }, { column: "r.id", order: "desc" }]);

  app.get("/meal/reports", view, async (request) =>
    paginate(ordered(filtered(request.auth, request.query, await visibleProjectIds(db, request.auth))), pageParams(request.query), (rows) => rows.map(toReport)),
  );

  app.get("/meal/reports/stats", view, async (request) => {
    const ids = await visibleProjectIds(db, request.auth);
    const rows = await scopeIds(db("meal_reports").where({ organization_id: request.auth.organizationId }), ids, "project_id").select("status");
    const by = (s) => rows.filter((r) => r.status === s).length;
    return { data: { total: rows.length, draft: by("draft"), in_review: by("in_review"), needs_edit: by("needs_edit"), approved: by("approved") } };
  });

  app.get("/meal/reports/insights", view, async (request) => {
    const ids = await visibleProjectIds(db, request.auth);
    const rows = await scopeIds(db("meal_reports").where({ organization_id: request.auth.organizationId }), ids, "project_id").select("status", "updated_at");
    const by = (s) => rows.filter((r) => r.status === s);
    const summary = [];
    if (rows.length) summary.push({ text: `إجمالي التقارير: ${rows.length}`, level: "info" });
    if (by("in_review").length) summary.push({ text: `${by("in_review").length} تقرير قيد المراجعة`, level: "warning" });
    if (by("approved").length) summary.push({ text: `${by("approved").length} تقرير معتمد`, level: "success" });

    const actions = [];
    if (by("needs_edit").length) actions.push({ text: `${by("needs_edit").length} تقرير يحتاج تعديل`, level: "danger" });
    const slowReview = by("in_review").filter((r) => daysBetween(iso(r.updated_at)) > 7).length;
    if (slowReview) actions.push({ text: `${slowReview} تقرير بانتظار الاعتماد منذ أكثر من 7 أيام`, level: "warning" });
    const oldDrafts = by("draft").filter((r) => daysBetween(iso(r.updated_at)) > 14).length;
    if (oldDrafts) actions.push({ text: `${oldDrafts} مسودة لم تُحدَّث منذ أكثر من 14 يوماً`, level: "info" });
    return { data: { summary, actions } };
  });

  app.get("/meal/report-templates", view, async (request) => {
    const rows = await db("report_templates").where((w) => w.whereNull("organization_id").orWhere({ organization_id: request.auth.organizationId })).orderBy("id");
    return listOf(rows.map((t) => ({ id: t.id, name: t.name, type: t.type, description: t.description })));
  });

  app.get("/meal/reports/export", view, async (request, reply) => {
    const rows = (await ordered(filtered(request.auth, request.query, await visibleProjectIds(db, request.auth))).limit(10_000)).map(toReport);
    const body = toCsv(rows, [
      { header: "العنوان", value: (r) => r.title },
      { header: "النوع", value: (r) => r.type },
      { header: "المشروع", value: (r) => r.project },
      { header: "الفترة", value: (r) => r.period },
      { header: "الحالة", value: (r) => STATUS_AR[r.status] ?? r.status },
      { header: "المسؤول", value: (r) => r.owner?.name },
      { header: "آخر تحديث", value: (r) => r.updated_at },
    ]);
    return sendBuffer(reply, { body, name: "meal-reports.csv", mime: "text/csv; charset=utf-8" });
  });

  app.post("/meal/reports", manage, async (request, reply) => {
    const auth = request.auth;
    const input = parse(createMealReportSchema, request.body);
    const projectId = await resolveProjectField(db, auth, input.project_id); // a project the person works in
    if (input.template_id !== undefined) {
      const t = await db("report_templates").where({ id: input.template_id }).where((w) => w.whereNull("organization_id").orWhere({ organization_id: auth.organizationId })).first("id");
      if (!t) throw new ValidationError({ template_id: ["القالب المحدد غير موجود."] });
    }
    const now = nowIso();
    const [{ id }] = await db("meal_reports").insert(
      { organization_id: auth.organizationId, title: input.title, type: input.type, project_id: projectId, period: input.period ?? null, status: "draft", owner_id: auth.userId, created_at: now, updated_at: now },
      ["id"],
    );
    return reply.status(201).send({ data: toReport(await ordered(base(auth.organizationId).where("r.id", id)).first()) });
  });

  app.patch("/meal/reports/:id", manage, async (request) => {
    const auth = request.auth;
    const id = paramId(request.params.id);
    const { status } = parse(updateMealReportSchema, request.body);
    const current = await db("meal_reports").where({ id, organization_id: auth.organizationId }).first();
    if (!current) throw notFound("التقرير غير موجود.");
    await assertRowAccess(db, auth, current.project_id); // 404 outside the project's team
    await db("meal_reports").where({ id }).update({ status, updated_at: nowIso() });
    if (status !== current.status && current.owner_id && current.owner_id !== auth.userId) {
      await notifyUsers(db, { organizationId: auth.organizationId, userIds: [current.owner_id], title: "تغيّرت حالة تقريرك", message: `${current.title} — ${STATUS_AR[status]}`, type: status === "needs_edit" ? "alert" : "system", link: "/dashboard/meal/reports" });
    }
    return { data: toReport(await ordered(base(auth.organizationId).where("r.id", id)).first()) };
  });

  // The document is rendered from live data at download time (self-contained RTL HTML: print it to PDF).
  app.get("/meal/reports/:id/download", view, async (request, reply) => {
    const org = request.auth.organizationId;
    const report = await ordered(base(org).where("r.id", paramId(request.params.id))).first();
    if (!report) throw notFound("التقرير غير موجود.");
    await assertRowAccess(db, request.auth, report.project_id);
    const body = await renderReportHtml(db, org, report);
    return sendBuffer(reply, { body, name: `${report.title}.html`, mime: "text/html; charset=utf-8" });
  });
}
