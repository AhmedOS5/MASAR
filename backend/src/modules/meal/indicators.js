// /meal/indicators — logical-framework indicators: target vs achieved, derived status, CSV import/export.
import { ValidationError, notFound } from "../../lib/errors.js";
import { applySearch, hasFilter, pageParams, paginate } from "../../lib/pagination.js";
import { toCsv, parseCsv } from "../../lib/csv.js";
import { sendBuffer } from "../../lib/http-files.js";
import { receiveUploads } from "../../lib/uploads.js";
import { iso, nowIso } from "../../lib/time.js";
import { paramId, parse, text, z } from "../../lib/validate.js";
import { activeMember } from "../auth/members.js";
import { assertRowAccess, filterProject, resolveProjectField, scopeIds, usersOnProject, visibleProjectIds } from "../projects/access.js";
import { createIndicatorSchema, updateIndicatorSchema } from "./schema.js";
import { changeIndicator, indicatorStatus, progressPercent, round2 } from "./indicators-core.js";
import { daysBetween, mealGuard } from "./guard.js";

const STATUS_AR = { on_track: "على المسار", needs_follow: "بحاجة متابعة", delayed: "متأخر", achieved: "محققة" };
const STALE_DAYS = 30;
const MAX_IMPORT_ROWS = 1000;

const toIndicator = (i) => ({
  id: i.id,
  code: i.code,
  name: i.name,
  project_id: i.project_id,
  project: i.project_name,
  sector: i.sector,
  target: round2(i.target),
  achieved: round2(i.achieved),
  progress: progressPercent(i.target, i.achieved),
  status: i.status,
  updated_at: iso(i.updated_at),
  owner: i.owner_id ? { id: i.owner_id, name: i.owner_name } : null,
});

// CSV header aliases (English or Arabic) -> field
const HEADERS = {
  code: ["code", "الرمز", "رمز المؤشر"],
  name: ["name", "الاسم", "اسم المؤشر"],
  project: ["project", "المشروع"],
  sector: ["sector", "القطاع"],
  target: ["target", "المستهدف", "القيمة المستهدفة"],
  achieved: ["achieved", "المحقق", "القيمة المحققة"],
};
const fieldOf = (header) => Object.entries(HEADERS).find(([, names]) => names.includes(header.trim().toLowerCase()))?.[0];
const importRowSchema = z.object({
  code: createIndicatorSchema.shape.code,
  name: createIndicatorSchema.shape.name,
  project: text(150), // the project's NAME in the file; resolved to one the person works in
  sector: createIndicatorSchema.shape.sector,
  target: createIndicatorSchema.shape.target,
  achieved: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().min(0).max(1_000_000_000_000).optional()),
});

export default async function indicatorRoutes(app) {
  const { db, storage } = app;
  const view = { preHandler: mealGuard(app, "meal.view") };
  const manage = { preHandler: mealGuard(app, "meal.manage") };

  const base = (org) =>
    db("indicators as i").leftJoin("users as o", "o.id", "i.owner_id").leftJoin("projects as pr", "pr.id", "i.project_id").where("i.organization_id", org);
  const COLUMNS = ["i.*", "o.name as owner_name", "pr.name as project_name"];
  /** Only the indicators of the caller's projects (`ids` from visibleProjectIds). */
  function filtered(auth, q, ids) {
    const qb = scopeIds(base(auth.organizationId), ids, "i.project_id");
    for (const key of ["status", "sector"]) if (hasFilter(q[key])) qb.where(`i.${key}`, String(q[key]));
    if (hasFilter(q.project_id)) filterProject(qb, q.project_id, "i.project_id");
    return applySearch(qb, q.search, ["i.name", "i.code"]);
  }
  const ordered = (qb) => qb.select(COLUMNS).orderBy("i.id");
  const one = async (org, id) => {
    const row = await ordered(base(org).where("i.id", id)).first();
    return row && toIndicator(row);
  };

  const codeTaken = async (org, code, exceptId = null) => {
    const qb = db("indicators").where({ organization_id: org }).whereRaw("lower(code) = ?", [code.toLowerCase()]);
    if (exceptId) qb.whereNot({ id: exceptId });
    return Boolean(await qb.first("id"));
  };
  const duplicateCode = () => new ValidationError({ code: ["الرمز مستخدم مسبقاً."] });
  const isUnique = (err) => /unique|duplicate/i.test(String(err?.message));

  app.get("/meal/indicators", view, async (request) =>
    paginate(ordered(filtered(request.auth, request.query, await visibleProjectIds(db, request.auth))), pageParams(request.query), (rows) => rows.map(toIndicator)),
  );

  app.get("/meal/indicators/stats", view, async (request) => {
    const ids = await visibleProjectIds(db, request.auth);
    const rows = await scopeIds(db("indicators").where({ organization_id: request.auth.organizationId }), ids, "project_id").select("project_id", "status");
    const by = (s) => rows.filter((r) => r.status === s).length;
    return {
      data: {
        total: rows.length,
        projects_count: new Set(rows.map((r) => r.project_id)).size,
        on_track: by("on_track"),
        needs_follow: by("needs_follow"),
        delayed: by("delayed"),
        achieved: by("achieved"),
      },
    };
  });

  app.get("/meal/indicators/insights", view, async (request) => {
    const ids = await visibleProjectIds(db, request.auth);
    const rows = await scopeIds(db("indicators").where({ organization_id: request.auth.organizationId }), ids, "project_id").select("id", "code", "sector", "target", "achieved", "status", "updated_at");
    const insights = [];
    const delayed = rows.filter((r) => r.status === "delayed");
    if (delayed.length) {
      insights.push({ text: `${delayed.length} مؤشر متأخر عن المسار`, level: "danger" });
      const bySector = {};
      for (const r of delayed) bySector[r.sector ?? "غير محدد"] = (bySector[r.sector ?? "غير محدد"] ?? 0) + 1;
      const [worst] = Object.entries(bySector).sort((a, b) => b[1] - a[1]);
      insights.push({ text: `أكثر قطاع متأخر: ${worst[0]}`, level: "danger" });
    }
    if (rows.length) {
      const avg = Math.round(rows.reduce((s, r) => s + progressPercent(r.target, r.achieved), 0) / rows.length);
      insights.push({ text: `متوسط الإنجاز العام ${avg}%`, level: avg >= 70 ? "success" : avg >= 40 ? "warning" : "danger" });
    }
    const achieved = rows.filter((r) => r.status === "achieved").length;
    if (achieved) insights.push({ text: `${achieved} مؤشر تم تحقيقه بالكامل`, level: "success" });

    const updates = rows
      .filter((r) => r.status !== "achieved" && daysBetween(iso(r.updated_at)) >= STALE_DAYS)
      .sort((a, b) => new Date(iso(a.updated_at)) - new Date(iso(b.updated_at)))
      .slice(0, 5)
      .map((r) => ({ indicator_id: r.id, code: r.code, text: `لم يُحدَّث منذ ${daysBetween(iso(r.updated_at))} يوماً` }));
    return { data: { insights, updates } };
  });

  app.get("/meal/indicators/export", view, async (request, reply) => {
    const rows = (await ordered(filtered(request.auth, request.query, await visibleProjectIds(db, request.auth))).limit(10_000)).map(toIndicator);
    const body = toCsv(rows, [
      { header: "الرمز", value: (r) => r.code },
      { header: "الاسم", value: (r) => r.name },
      { header: "المشروع", value: (r) => r.project },
      { header: "القطاع", value: (r) => r.sector },
      { header: "المستهدف", value: (r) => r.target },
      { header: "المحقق", value: (r) => r.achieved },
      { header: "نسبة الإنجاز %", value: (r) => r.progress },
      { header: "الحالة", value: (r) => STATUS_AR[r.status] ?? r.status },
      { header: "المسؤول", value: (r) => r.owner?.name },
    ]);
    return sendBuffer(reply, { body, name: "indicators.csv", mime: "text/csv; charset=utf-8" });
  });

  app.post("/meal/indicators", manage, async (request, reply) => {
    const auth = request.auth;
    const input = parse(createIndicatorSchema, request.body);
    const projectId = await resolveProjectField(db, auth, input.project_id); // a project the person works in
    if (input.owner_id != null && !(await activeMember(db, auth.organizationId, input.owner_id))) throw new ValidationError({ owner_id: ["المسؤول المحدد غير موجود."] });
    if (await codeTaken(auth.organizationId, input.code)) throw duplicateCode();
    let id;
    try {
      const now = nowIso();
      [{ id }] = await db("indicators").insert(
        {
          organization_id: auth.organizationId,
          code: input.code,
          name: input.name,
          project_id: projectId,
          sector: input.sector ?? null,
          target: input.target,
          achieved: 0,
          status: indicatorStatus(input.target, 0),
          owner_id: input.owner_id ?? auth.userId,
          created_at: now,
          updated_at: now,
        },
        ["id"],
      );
    } catch (err) {
      if (isUnique(err)) throw duplicateCode();
      throw err;
    }
    return reply.status(201).send({ data: await one(auth.organizationId, id) });
  });

  app.patch("/meal/indicators/:id", manage, async (request) => {
    const auth = request.auth;
    const id = paramId(request.params.id);
    const input = parse(updateIndicatorSchema, request.body);
    const current = await db("indicators").where({ id, organization_id: auth.organizationId }).first("id", "project_id");
    if (!current) throw notFound("المؤشر غير موجود.");
    await assertRowAccess(db, auth, current.project_id); // 404 outside the project's team
    if (input.owner_id != null && !(await activeMember(db, auth.organizationId, input.owner_id))) throw new ValidationError({ owner_id: ["المسؤول المحدد غير موجود."] });

    await db.transaction(async (trx) => {
      if (input.owner_id !== undefined) await trx("indicators").where({ id }).update({ owner_id: input.owner_id, updated_at: nowIso() });
      if (input.achieved !== undefined) {
        await changeIndicator(trx, { organizationId: auth.organizationId, indicatorId: id, set: input.achieved, source: "manual", userId: auth.userId });
      }
    });
    return { data: await one(auth.organizationId, id) };
  });

  // CSV import: all-or-nothing, so a half-imported file never needs cleaning up.
  app.post("/meal/indicators/import", manage, async (request) => {
    const auth = request.auth;
    const { files } = await receiveUploads(request, { storage, folder: `org-${auth.organizationId}/imports`, field: "file", maxBytes: app.config.maxUploadBytes, maxFiles: 1 });
    const key = files[0].key;
    let text;
    try {
      const chunks = [];
      for await (const c of storage.open(key)) chunks.push(c);
      text = Buffer.concat(chunks).toString("utf8");
    } finally {
      await storage.remove(key); // the upload is only a transport; keep nothing
    }
    if (text.includes("\u0000")) throw new ValidationError({ file: ["الملف ليس بصيغة CSV نصية."] });

    const [headerRow, ...dataRows] = parseCsv(text);
    if (!headerRow) throw new ValidationError({ file: ["الملف فارغ."] });
    const columns = headerRow.map(fieldOf);
    const missing = ["code", "name", "project", "target"].filter((f) => !columns.includes(f));
    if (missing.length) throw new ValidationError({ file: [`أعمدة مطلوبة مفقودة: ${missing.join("، ")}`] });
    if (!dataRows.length) throw new ValidationError({ file: ["لا توجد صفوف بيانات في الملف."] });
    if (dataRows.length > MAX_IMPORT_ROWS) throw new ValidationError({ file: [`الحد الأقصى ${MAX_IMPORT_ROWS} صف في الملف الواحد.`] });

    // project names in the file -> the projects this person works in (any case)
    const visible = await visibleProjectIds(db, auth);
    const projects = await scopeIds(db("projects").where({ organization_id: auth.organizationId }), visible, "id").select("id", "name");
    const projectByName = new Map(projects.map((p) => [p.name.trim().toLowerCase(), p.id]));
    const existing = new Set((await db("indicators").where({ organization_id: auth.organizationId }).pluck("code")).map((c) => c.toLowerCase()));
    const seen = new Set();
    const problems = [];
    const valid = [];
    dataRows.forEach((cells, idx) => {
      const line = idx + 2; // header is line 1
      const raw = {};
      columns.forEach((f, i) => f && (raw[f] = cells[i] ?? ""));
      const r = importRowSchema.safeParse(raw);
      if (!r.success) {
        problems.push(`السطر ${line}: ${r.error.issues.map((x) => `${x.path[0]} — ${x.message}`).join("؛ ")}`);
        return;
      }
      const lc = r.data.code.toLowerCase();
      const projectId = projectByName.get(r.data.project.trim().toLowerCase());
      if (!projectId) problems.push(`السطر ${line}: المشروع «${r.data.project}» غير موجود أو لا تعمل فيه.`);
      else if (existing.has(lc) || seen.has(lc)) problems.push(`السطر ${line}: الرمز ${r.data.code} مستخدم مسبقاً.`);
      else {
        seen.add(lc);
        valid.push({ ...r.data, project_id: projectId });
      }
    });
    if (problems.length) {
      throw new ValidationError({ file: problems.slice(0, 10) }, `تعذّر الاستيراد، لم يتم حفظ أي مؤشر. ${problems[0]}${problems.length > 1 ? ` (و${problems.length - 1} أخطاء أخرى)` : ""}`);
    }

    await db.transaction(async (trx) => {
      for (const row of valid) {
        const now = nowIso();
        const achieved = row.achieved ?? 0;
        const [{ id }] = await trx("indicators").insert(
          { organization_id: auth.organizationId, code: row.code, name: row.name, project_id: row.project_id, sector: row.sector ?? null, target: row.target, achieved, status: indicatorStatus(row.target, achieved), owner_id: auth.userId, created_at: now, updated_at: now },
          ["id"],
        );
        if (achieved > 0) {
          await trx("indicator_updates").insert({ organization_id: auth.organizationId, indicator_id: id, delta: achieved, value_after: achieved, source: "manual", created_by: auth.userId, created_at: now });
        }
      }
    });
    return { imported: valid.length };
  });
}
