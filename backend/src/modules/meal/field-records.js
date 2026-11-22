// /meal/field-records — field data entry. A submitted record adds its achieved value to the chosen indicator.
import { ValidationError } from "../../lib/errors.js";
import { hasFilter, pageParams, paginate } from "../../lib/pagination.js";
import { ALLOWED_DOCUMENT_MIMES, receiveUploads } from "../../lib/uploads.js";
import { iso, nowIso } from "../../lib/time.js";
import { paramId, parse } from "../../lib/validate.js";
import { sendAttachment } from "../shared/attachments.js";
import { assertRowAccess, filterProject, resolveProjectField, scopeIds, usersOnProject, visibleProjectIds } from "../projects/access.js";
import { fieldRecordSchema } from "./schema.js";
import { changeIndicator, round2 } from "./indicators-core.js";
import { mealGuard } from "./guard.js";

const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024; // same rule as the form
const MAX_ATTACHMENTS = 10;

export default async function fieldRecordRoutes(app) {
  const { db, storage } = app;
  const view = { preHandler: mealGuard(app, "meal.view") };
  const manage = { preHandler: mealGuard(app, "meal.manage") };

  async function present(org, rows) {
    const ids = rows.map((r) => r.id);
    const atts = ids.length ? await db("attachments").where({ organization_id: org, attachable_type: "field_record" }).whereIn("attachable_id", ids).orderBy("id") : [];
    return rows.map((r) => ({
      id: r.id,
      project_id: r.project_id,
      project: r.project_name,
      sector: r.sector,
      activity_type: r.activity_type,
      activity_date: r.activity_date,
      title: r.title,
      description: r.description,
      region: r.region,
      location: r.location,
      indicator_id: r.indicator_id,
      indicator: r.indicator_id ? { id: r.indicator_id, code: r.indicator_code } : null,
      achieved_value: r.achieved_value === null ? null : round2(r.achieved_value),
      total_beneficiaries: r.total_beneficiaries,
      status: r.status,
      attachments: atts.filter((a) => a.attachable_id === r.id).map((a) => ({ id: a.id, name: a.name, size: a.size, mime: a.mime })),
      created_at: iso(r.created_at),
    }));
  }

  const base = (org) =>
    db("field_records as f")
      .leftJoin("indicators as i", "i.id", "f.indicator_id")
      .leftJoin("projects as pr", "pr.id", "f.project_id")
      .where("f.organization_id", org)
      .select("f.*", "i.code as indicator_code", "pr.name as project_name");

  app.get("/meal/field-records", view, async (request) => {
    const org = request.auth.organizationId;
    const q = request.query;
    const qb = scopeIds(base(org), await visibleProjectIds(db, request.auth), "f.project_id").orderBy([{ column: "f.created_at", order: "desc" }, { column: "f.id", order: "desc" }]);
    if (hasFilter(q.status)) qb.where("f.status", String(q.status));
    if (hasFilter(q.project_id)) filterProject(qb, q.project_id, "f.project_id");
    return paginate(qb, pageParams(q), (rows) => present(org, rows));
  });

  app.post("/meal/field-records", manage, async (request, reply) => {
    const auth = request.auth;
    const org = auth.organizationId;

    let fields = request.body ?? {};
    let files = [];
    if (request.isMultipart()) {
      ({ files, fields } = await receiveUploads(request, {
        storage,
        folder: `org-${org}/field-records`,
        field: "attachments",
        allowedMimes: ALLOWED_DOCUMENT_MIMES,
        maxBytes: ATTACHMENT_MAX_BYTES,
        maxFiles: MAX_ATTACHMENTS,
        minFiles: 0,
      }));
    }

    try {
      const input = parse(fieldRecordSchema, fields);
      const projectId = await resolveProjectField(db, auth, input.project_id); // a project the person works in
      // the indicator measured by a record is one of the same project
      if (input.indicator_id !== undefined && !(await db("indicators").where({ id: input.indicator_id, organization_id: org, project_id: projectId }).first("id"))) {
        throw new ValidationError({ indicator_id: ["المؤشر المحدد غير موجود في هذا المشروع."] });
      }

      const id = await db.transaction(async (trx) => {
        const now = nowIso();
        const [{ id: recordId }] = await trx("field_records").insert(
          {
            organization_id: org,
            project_id: projectId,
            sector: input.sector ?? null,
            activity_type: input.activity_type ?? null,
            activity_date: input.activity_date ?? null,
            title: input.title ?? null,
            description: input.description ?? null,
            region: input.region ?? null,
            location: input.location ?? null,
            indicator_id: input.indicator_id ?? null,
            achieved_value: input.achieved_value ?? null,
            total_beneficiaries: input.total_beneficiaries ?? null,
            status: input.status,
            created_by: auth.userId,
            created_at: now,
          },
          ["id"],
        );
        if (files.length) {
          await trx("attachments").insert(
            files.map((f) => ({ organization_id: org, attachable_type: "field_record", attachable_id: recordId, name: f.name, size: f.size, mime: f.mime, storage_key: f.key, uploaded_by: auth.userId, created_at: now })),
          );
        }
        // Only a submitted record counts towards the indicator.
        if (input.status === "submitted" && input.achieved_value > 0) {
          await changeIndicator(trx, { organizationId: org, indicatorId: input.indicator_id, add: input.achieved_value, source: "field_record", fieldRecordId: recordId, userId: auth.userId });
        }
        return recordId;
      });
      const [row] = await base(org).where("f.id", id);
      return reply.status(201).send({ data: (await present(org, [row]))[0] });
    } catch (err) {
      await Promise.allSettled(files.map((f) => storage.remove(f.key)));
      throw err;
    }
  });

  // Extension: the evidence attached to a record has to be retrievable.
  app.get("/meal/field-records/:id/attachments/:aid/download", view, async (request, reply) => {
    const id = paramId(request.params.id);
    const record = await db("field_records").where({ id, organization_id: request.auth.organizationId }).first("project_id");
    if (record) await assertRowAccess(db, request.auth, record.project_id); // 404 outside the project's team
    return sendAttachment(app, reply, request.auth, { type: "field_record", id, attachmentId: paramId(request.params.aid) });
  });
}
