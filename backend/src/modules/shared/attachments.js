// Attachments on requests and tasks (polymorphic `attachments` table). The owning row is always verified by the
// caller BEFORE the upload is read, so a file is never stored for something that does not exist.
import { ValidationError, notFound } from "../../lib/errors.js";
import { iso, nowIso } from "../../lib/time.js";
import { receiveUploads } from "../../lib/uploads.js";
import { sendStored } from "../../lib/http-files.js";
import { writeAudit } from "../../lib/audit.js";
import { assertMayRemove } from "../projects/access.js";

const OWNER_TABLE = { request: "requests", task: "tasks" };

export const MAX_ATTACHMENTS_PER_ITEM = 20;

export const toAttachment = (a) => ({ id: a.id, name: a.name, size: a.size, mime: a.mime, created_at: iso(a.created_at) });

export async function listAttachments(db, organizationId, type, id) {
  const rows = await db("attachments").where({ organization_id: organizationId, attachable_type: type, attachable_id: id }).orderBy("id");
  return rows.map(toAttachment);
}

/** Read one `file` field from the multipart request and attach it to (type, id). */
export async function attachUploadedFile(app, request, { type, id }) {
  const { db, storage } = app;
  const auth = request.auth;
  const existing = Number((await db("attachments").where({ organization_id: auth.organizationId, attachable_type: type, attachable_id: id }).count({ n: "*" }).first()).n);
  if (existing >= MAX_ATTACHMENTS_PER_ITEM) throw new ValidationError({ file: [`الحد الأقصى ${MAX_ATTACHMENTS_PER_ITEM} مرفقاً.`] });

  const { files } = await receiveUploads(request, {
    storage,
    folder: `org-${auth.organizationId}/attachments`,
    field: "file",
    maxBytes: app.config.maxUploadBytes,
    maxFiles: 1,
  });
  const f = files[0];
  try {
    const [row] = await db("attachments").insert(
      { organization_id: auth.organizationId, attachable_type: type, attachable_id: id, name: f.name, size: f.size, mime: f.mime, storage_key: f.key, uploaded_by: auth.userId, created_at: nowIso() },
      ["id", "name", "size", "mime", "created_at"],
    );
    return toAttachment(row);
  } catch (err) {
    await storage.remove(f.key);
    throw err;
  }
}

export async function sendAttachment(app, reply, auth, { type, id, attachmentId }) {
  const a = await app.db("attachments").where({ id: attachmentId, organization_id: auth.organizationId, attachable_type: type, attachable_id: id }).first();
  if (!a || !(await app.storage.exists(a.storage_key))) throw notFound("المرفق غير موجود.");
  return sendStored(reply, app.storage, a);
}

/**
 * Delete one attachment (row, bytes on disk, audit entry). The caller has already checked that the owning request or task
 * is reachable. Whoever attached the file, a supervisor, or someone with full project access may remove it.
 */
export async function removeAttachment(app, auth, { type, id, attachmentId }) {
  const { db, storage } = app;
  const a = await db("attachments").where({ id: attachmentId, organization_id: auth.organizationId, attachable_type: type, attachable_id: id }).first();
  if (!a) throw notFound("المرفق غير موجود.");
  const owner = await db(OWNER_TABLE[type]).where({ id, organization_id: auth.organizationId }).first("project_id");
  if (!owner) throw notFound("المرفق غير موجود.");
  await assertMayRemove(db, auth, owner.project_id, a.uploaded_by);
  await db.transaction(async (trx) => {
    await trx("attachments").where({ id: a.id }).del();
    await writeAudit(trx, {
      organizationId: auth.organizationId, actorId: auth.userId, action: "attachment.deleted", entityType: "attachment", entityId: a.id,
      meta: { name: a.name, attachable_type: type, attachable_id: id, project_id: owner.project_id },
    });
  });
  await storage.remove(a.storage_key);
}
