// File manager: folders and files. Any file type is accepted — documents and images alike (served only as a download).
// Every folder belongs to a project and every file lives in a folder: only that project's team (and people with full
// project access) see the folder, put files into it, or download from it.
import { ValidationError, notFound } from "../../lib/errors.js";
import { applySearch, hasFilter, listOf, pageParams, paginate } from "../../lib/pagination.js";
import { iso, nowIso } from "../../lib/time.js";
import { paramId, parse, requiredId, text, z } from "../../lib/validate.js";
import { receiveUploads } from "../../lib/uploads.js";
import { sendStored } from "../../lib/http-files.js";
import { writeAudit } from "../../lib/audit.js";
import { assertMayRemove, assertRowAccess, filterProject, projectRoleOf, resolveProjectField, scopeIds, visibleProjectIds } from "../projects/access.js";

const folderSchema = z.object({ name: text(100), project_id: requiredId() });

const toFile = (f) => ({ id: f.id, name: f.name, size: f.size, mime: f.mime, folder_id: f.folder_id, created_at: iso(f.created_at) });

export default async function fileRoutes(app) {
  const { db, storage } = app;
  const view = { preHandler: app.guard({ permission: "files.view" }) };
  const upload = { preHandler: app.guard({ permission: "files.upload" }) };

  app.get("/files/folders", view, async (request) => {
    const q = request.query;
    // folders of the projects the caller may reach
    const qb = scopeIds(db("folders").where({ organization_id: request.auth.organizationId }), await visibleProjectIds(db, request.auth), "project_id").orderBy("id");
    if (hasFilter(q.project_id)) filterProject(qb, q.project_id, "project_id");
    const folders = await qb;
    const counts = folders.length
      ? await db("files").whereIn("folder_id", folders.map((f) => f.id)).groupBy("folder_id").select("folder_id").count({ n: "*" })
      : [];
    const byFolder = new Map(counts.map((c) => [c.folder_id, Number(c.n)]));
    return listOf(folders.map((f) => ({ id: f.id, name: f.name, project_id: f.project_id, items_count: byFolder.get(f.id) ?? 0 })));
  });

  // Folders are created by whoever may upload (files.upload) — in a project, by its team.
  app.post("/files/folders", upload, async (request, reply) => {
    const { name, project_id } = parse(folderSchema, request.body);
    const auth = request.auth;
    const projectId = await resolveProjectField(db, auth, project_id);
    const same = db("folders").where({ organization_id: auth.organizationId }).whereRaw("lower(name) = ?", [name.toLowerCase()]);
    if (await same.where({ project_id: projectId }).first("id")) {
      throw new ValidationError({ name: ["يوجد مجلد بنفس الاسم."] });
    }
    const [{ id }] = await db("folders").insert({ organization_id: auth.organizationId, project_id: projectId, name }, ["id"]);
    return reply.status(201).send({ data: { id, name, project_id: projectId, items_count: 0 } });
  });

  app.get("/files", view, async (request) => {
    const q = request.query;
    const auth = request.auth;
    const qb = db("files").where({ organization_id: auth.organizationId });
    // a file in a project's folder follows that folder's reach
    const ids = await visibleProjectIds(db, auth);
    if (ids !== null) {
      const allowed = scopeIds(db("folders").where({ organization_id: auth.organizationId }), ids, "project_id").select("id");
      qb.whereIn("folder_id", allowed);
    }
    if (hasFilter(q.folder_id)) {
      const id = Number(q.folder_id);
      if (Number.isInteger(id)) qb.where({ folder_id: id });
      else qb.whereRaw("1 = 0");
    }
    if (hasFilter(q.project_id)) qb.whereIn("folder_id", filterProject(db("folders").where({ organization_id: auth.organizationId }), q.project_id, "project_id").select("id"));
    applySearch(qb, q.search, ["name"]);
    qb.orderBy([{ column: "created_at", order: "desc" }, { column: "id", order: "desc" }]);
    return paginate(qb, pageParams(q), (rows) => rows.map(toFile));
  });

  app.post("/files", upload, async (request, reply) => {
    const auth = request.auth;
    const org = auth.organizationId;
    const { files, fields } = await receiveUploads(request, {
      storage,
      folder: `org-${org}/files`,
      field: "file",
      maxBytes: app.config.maxUploadBytes,
      maxFiles: 1,
    });
    const f = files[0];
    try {
      // a file always lives in a folder (and so in a project)
      if (!hasFilter(fields.folder_id)) throw new ValidationError({ folder_id: ["الحقل مطلوب."] });
      const folderId = Number(fields.folder_id);
      const folder = Number.isInteger(folderId) && (await db("folders").where({ id: folderId, organization_id: org }).first("id", "project_id"));
      // a folder of a project the person is not part of "does not exist" for them
      if (!folder || !(await projectRoleOf(db, auth, folder.project_id))) throw new ValidationError({ folder_id: ["المجلد المحدد غير موجود."] });
      const [row] = await db("files").insert(
        { organization_id: org, folder_id: folderId, name: f.name, size: f.size, mime: f.mime, storage_key: f.key, uploaded_by: auth.userId, created_at: nowIso() },
        ["id", "folder_id", "name", "size", "mime", "created_at"],
      );
      return reply.status(201).send({ data: toFile(row) });
    } catch (err) {
      await storage.remove(f.key);
      throw err;
    }
  });

  app.get("/files/:id/download", view, async (request, reply) => {
    const auth = request.auth;
    const f = await db("files").where({ id: paramId(request.params.id), organization_id: auth.organizationId }).first();
    if (!f || !(await storage.exists(f.storage_key))) throw notFound("الملف غير موجود.");
    const folder = await db("folders").where({ id: f.folder_id }).first("project_id");
    if (!folder || !(await projectRoleOf(db, auth, folder.project_id))) throw notFound("الملف غير موجود.");
    return sendStored(reply, storage, f);
  });

  // Deleting a file removes the row, the bytes on disk and leaves an audit entry. Whoever uploaded it may delete it;
  // so may the project's supervisors and people with full project access. Anyone else in the project gets 403.
  app.delete("/files/:id", upload, async (request, reply) => {
    const auth = request.auth;
    const f = await db("files").where({ id: paramId(request.params.id), organization_id: auth.organizationId }).first();
    const folder = f && (await db("folders").where({ id: f.folder_id }).first("project_id"));
    if (!f || !folder) throw notFound("الملف غير موجود.");
    await assertMayRemove(db, auth, folder.project_id, f.uploaded_by);
    await db.transaction(async (trx) => {
      await trx("files").where({ id: f.id }).del();
      await writeAudit(trx, {
        organizationId: auth.organizationId, actorId: auth.userId, action: "file.deleted", entityType: "file", entityId: f.id,
        meta: { name: f.name, folder_id: f.folder_id, project_id: folder.project_id },
      });
    });
    await storage.remove(f.storage_key);
    return reply.status(204).send();
  });

  // Deleting a folder deletes the files inside it (rows and bytes). Reports filed in it are kept, just taken out of the
  // folder. Only supervisors and people with full project access may do this.
  app.delete("/files/folders/:id", upload, async (request, reply) => {
    const auth = request.auth;
    const folder = await db("folders").where({ id: paramId(request.params.id), organization_id: auth.organizationId }).first();
    if (!folder) throw notFound("المجلد غير موجود.");
    await assertRowAccess(db, auth, folder.project_id, { supervisor: true });
    const files = await db("files").where({ folder_id: folder.id }).select("id", "storage_key");
    await db.transaction(async (trx) => {
      await trx("reports").where({ folder_id: folder.id }).update({ folder_id: null });
      await trx("files").where({ folder_id: folder.id }).del();
      await trx("folders").where({ id: folder.id }).del();
      await writeAudit(trx, {
        organizationId: auth.organizationId, actorId: auth.userId, action: "folder.deleted", entityType: "folder", entityId: folder.id,
        meta: { name: folder.name, project_id: folder.project_id, files_deleted: files.length },
      });
    });
    for (const f of files) await storage.remove(f.storage_key);
    return reply.status(204).send();
  });
}
