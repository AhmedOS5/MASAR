// General reports: stored documents with a name, type and period. The summary figures are computed live.
import { ValidationError, notFound } from "../../lib/errors.js";
import { applySearch, hasFilter, pageParams, paginate } from "../../lib/pagination.js";
import { iso, nowIso } from "../../lib/time.js";
import { paramId, parse, optId, optText, nullableId, nullableText, requiredId, z } from "../../lib/validate.js";
import { receiveUploads } from "../../lib/uploads.js";
import { sendStored } from "../../lib/http-files.js";
import { assertRowAccess, filterProject, projectRoleOf, resolveProjectField, scopeIds, visibleProjectIds } from "../projects/access.js";
import { unitsFor, unitStatus } from "../units/routes.js";

// A report always belongs to a project and may also be filed in one of its folders. When a folder is given it decides the
// project, so `project_id` may be left out; without a folder, `project_id` is required.
const metaSchema = z.object({ name: optText(255), type: optText(100), period: optText(100), folder_id: optId(), project_id: optId() });
const patchSchema = z.object({ name: optText(255), type: nullableText(100).optional(), period: nullableText(100).optional(), folder_id: nullableId().optional() });

const toReport = (r) => ({
  id: r.id, name: r.name, type: r.type, period: r.period, size: r.size,
  folder_id: r.folder_id ?? null, project_id: r.project_id, created_at: iso(r.created_at),
});
const count = async (qb) => Number((await qb.count({ n: "*" }).first()).n);

/** Percentage change of tasks completed this (UTC) month against last month; 0 when there is nothing to compare. */
export function monthlyProgress(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export default async function reportRoutes(app) {
  const { db, storage } = app;
  const view = { preHandler: app.guard({ permission: "reports.view" }) };

  app.get("/reports/summary", view, async (request) => {
    const org = request.auth.organizationId;
    const now = new Date();
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString();
    const done = () => db("tasks").where({ organization_id: org }).whereNotNull("completed_at");

    const projectIds = await visibleProjectIds(db, request.auth);
    const [total, current, previous, units] = await Promise.all([
      count(scopeIds(db("reports").where({ organization_id: org }), projectIds, "project_id")),
      count(done().where("completed_at", ">=", thisMonth)),
      count(done().where("completed_at", ">=", lastMonth).where("completed_at", "<", thisMonth)),
      unitsFor(db, org),
    ]);
    return {
      data: {
        total_reports: total,
        monthly_progress: monthlyProgress(current, previous),
        active_sections: units.filter((u) => unitStatus(u) === "active").length,
      },
    };
  });

  app.get("/reports", view, async (request) => {
    const q = request.query;
    const qb = scopeIds(db("reports").where({ organization_id: request.auth.organizationId }), await visibleProjectIds(db, request.auth), "project_id");
    if (hasFilter(q.type)) qb.where({ type: String(q.type) });
    if (hasFilter(q.project_id)) filterProject(qb, q.project_id, "project_id");
    if (hasFilter(q.folder_id)) filterProject(qb, q.folder_id, "folder_id");
    applySearch(qb, q.search, ["name"]);
    qb.orderBy([{ column: "created_at", order: "desc" }, { column: "id", order: "desc" }]);
    return paginate(qb, pageParams(q), (rows) => rows.map(toReport));
  });

  /**
   * Where a report may be filed. Returns { folderId, projectId } or throws 422: the folder must exist and be reachable,
   * and the project (given or implied by the folder) must be one the caller works in. `current` = the report being moved.
   */
  async function placement(auth, { folderId, projectId }, current = null) {
    let folder = null;
    if (folderId != null) {
      folder = await db("folders").where({ id: folderId, organization_id: auth.organizationId }).first("id", "project_id");
      if (!folder || !(await projectRoleOf(db, auth, folder.project_id))) throw new ValidationError({ folder_id: ["المجلد المحدد غير موجود."] });
    }
    const wanted = projectId ?? current?.project_id ?? null;
    if (folder && wanted && folder.project_id !== wanted) throw new ValidationError({ project_id: ["المجلد يتبع مشروعاً آخر."] });
    const finalProject = folder?.project_id ?? wanted;
    await resolveProjectField(db, auth, finalProject); // 422 on project_id when there is none
    return { folderId: folder?.id ?? null, projectId: finalProject };
  }

  // Reports are documents someone adds — a team member with reports.manage can upload them (images too) into a folder.
  app.post("/reports", { preHandler: app.guard({ permission: "reports.manage" }) }, async (request, reply) => {
    const org = request.auth.organizationId;
    const { files, fields } = await receiveUploads(request, {
      storage,
      folder: `org-${org}/reports`,
      field: "file",
      maxBytes: app.config.maxUploadBytes,
      maxFiles: 1,
    });
    const f = files[0];
    try {
      const meta = parse(metaSchema, fields);
      const where = await placement(request.auth, { folderId: meta.folder_id, projectId: meta.project_id });
      const [row] = await db("reports").insert(
        {
          organization_id: org,
          folder_id: where.folderId,
          project_id: where.projectId,
          name: meta.name ?? f.name.replace(/\.[^.]+$/, ""),
          type: meta.type ?? null,
          period: meta.period ?? null,
          storage_key: f.key,
          mime: f.mime,
          file_name: f.name,
          size: f.size,
          created_by: request.auth.userId,
          created_at: nowIso(),
        },
        ["id", "name", "type", "period", "size", "folder_id", "project_id", "created_at"],
      );
      return reply.status(201).send({ data: toReport(row) });
    } catch (err) {
      await storage.remove(f.key);
      throw err;
    }
  });

  // Organise: rename, re-describe, or move a report to another folder ("" = take it out of its folder; the project stays).
  app.patch("/reports/:id", { preHandler: app.guard({ permission: "reports.manage" }) }, async (request) => {
    const auth = request.auth;
    const id = paramId(request.params.id);
    const r = await db("reports").where({ id, organization_id: auth.organizationId }).first();
    if (!r) throw notFound("التقرير غير موجود.");
    await assertRowAccess(db, auth, r.project_id); // outside the project's team: 404
    const input = parse(patchSchema, request.body);
    const patch = {};
    for (const k of ["name", "type", "period"]) if (input[k] !== undefined) patch[k] = input[k];
    if (input.folder_id !== undefined) {
      const where = await placement(auth, { folderId: input.folder_id }, r);
      patch.folder_id = where.folderId;
      patch.project_id = where.projectId;
    }
    if (Object.keys(patch).length) await db("reports").where({ id }).update(patch);
    return { data: toReport(await db("reports").where({ id }).first()) };
  });

  app.get("/reports/:id/download", view, async (request, reply) => {
    const r = await db("reports").where({ id: paramId(request.params.id), organization_id: request.auth.organizationId }).first();
    if (!r || !r.storage_key || !(await storage.exists(r.storage_key))) throw notFound("ملف التقرير غير متوفر.");
    await assertRowAccess(db, request.auth, r.project_id);
    return sendStored(reply, storage, { storage_key: r.storage_key, name: r.file_name ?? r.name, mime: r.mime, size: r.size });
  });
}
