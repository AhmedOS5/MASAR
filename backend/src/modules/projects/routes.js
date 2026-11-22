// Projects (a workspace per project), their teams, and each project's beneficiaries registry.
// Capability comes from the caller's job-category package (projects.*, beneficiaries.*); reach comes from membership
// (projects/access.js). Creating projects and building their teams is the system admin's job (`projects.manage`).
import { ValidationError, notFound } from "../../lib/errors.js";
import { applySearch, hasFilter, pageParams, paginate } from "../../lib/pagination.js";
import { nextCode } from "../../lib/sequence.js";
import { iso, nowIso } from "../../lib/time.js";
import { paramId, parse } from "../../lib/validate.js";
import { notifyUsers } from "../notifications/service.js";
import { attachUploadedFile, listAttachments, sendAttachment } from "../shared/attachments.js";
import { assertProjectAccess, hasFullProjectAccess, visibleProjectIds } from "./access.js";
import { createBeneficiarySchema, createProjectSchema, membersSchema, updateBeneficiarySchema, updateProjectSchema } from "./schema.js";

const count = (table, where) => `(select count(*) from ${table} where ${where})`;
const isUnique = (err) => /unique|duplicate/i.test(String(err?.message));

const toBeneficiary = (b) => ({
  id: b.id,
  code: b.code,
  project_id: b.project_id,
  full_name: b.full_name,
  national_id: b.national_id,
  gender: b.gender,
  birth_date: b.birth_date,
  phone: b.phone,
  region: b.region,
  address: b.address,
  household_size: b.household_size,
  notes: b.notes,
  status: b.status,
  created_at: iso(b.created_at),
  updated_at: iso(b.updated_at),
});

export default async function projectRoutes(app) {
  const { db } = app;
  const can = (permission) => ({ preHandler: app.guard({ permission }) });

  // -------------------------------------------------------------------------------- projects
  const projectRow = (p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    status: p.status,
    start_date: p.start_date,
    end_date: p.end_date,
    my_role: p.my_role ?? null,
    members_count: Number(p.members_count ?? 0),
    requests_count: Number(p.requests_count ?? 0),
    tasks_count: Number(p.tasks_count ?? 0),
    beneficiaries_count: Number(p.beneficiaries_count ?? 0),
    created_at: iso(p.created_at),
  });

  const projectQuery = (auth) =>
    db("projects as p")
      .leftJoin("project_members as me", (j) => j.on("me.project_id", "p.id").andOn("me.user_id", db.raw("?", [auth.userId])))
      .where("p.organization_id", auth.organizationId)
      .select(
        "p.*",
        "me.project_role as my_role",
        db.raw(`${count("project_members", "project_id = p.id")} as members_count`),
        db.raw(`${count("requests", "project_id = p.id")} as requests_count`),
        db.raw(`${count("tasks", "project_id = p.id")} as tasks_count`),
        db.raw(`${count("beneficiaries", "project_id = p.id")} as beneficiaries_count`),
      );

  async function findProject(auth, id, opts) {
    const role = await assertProjectAccess(db, auth, id, opts);
    const p = await projectQuery(auth).where("p.id", id).first();
    return { ...projectRow(p), my_role: hasFullProjectAccess(auth) ? "admin" : role };
  }

  async function members(projectId) {
    const rows = await db("project_members as m")
      .join("users as u", "u.id", "m.user_id")
      .leftJoin("roles as r", "r.id", "u.role_id")
      .where("m.project_id", projectId)
      .orderBy([{ column: "m.project_role", order: "asc" }, { column: "u.name", order: "asc" }])
      .select("u.id as user_id", "u.name", "u.email", "u.job_category", "r.title as role_title", "m.project_role");
    return rows;
  }

  app.get("/projects", can("projects.view"), async (request) => {
    const { auth, query } = request;
    const qb = projectQuery(auth);
    const ids = await visibleProjectIds(db, auth);
    if (ids !== null) qb.whereIn("p.id", ids);
    if (hasFilter(query.status)) qb.where("p.status", String(query.status));
    applySearch(qb, query.search, ["p.name", "p.code"]);
    qb.orderBy([{ column: "p.created_at", order: "desc" }, { column: "p.id", order: "desc" }]);
    const result = await paginate(qb, pageParams(query), (rows) => rows.map((p) => ({ ...projectRow(p), my_role: hasFullProjectAccess(auth) ? "admin" : p.my_role })));
    return result;
  });

  app.post("/projects", can("projects.manage"), async (request, reply) => {
    const { auth } = request;
    const input = parse(createProjectSchema, request.body);
    if (await nameTaken(auth.organizationId, input.name)) throw new ValidationError({ name: ["يوجد مشروع بنفس الاسم."] });
    const id = await db.transaction(async (trx) => {
      const code = await nextCode(trx, auth.organizationId, "project", "PRJ");
      const now = nowIso();
      const [{ id: newId }] = await trx("projects").insert(
        { organization_id: auth.organizationId, code, name: input.name, description: input.description ?? null, status: input.status ?? "active", start_date: input.start_date ?? null, end_date: input.end_date ?? null, created_by: auth.userId, created_at: now, updated_at: now },
        ["id"],
      );
      return newId;
    });
    return reply.status(201).send({ data: { ...(await findProject(auth, id)), members: [] } });
  });

  const nameTaken = async (organizationId, name, exceptId = null) => {
    const qb = db("projects").where({ organization_id: organizationId }).whereRaw("lower(name) = ?", [name.toLowerCase()]);
    if (exceptId) qb.whereNot({ id: exceptId });
    return Boolean(await qb.first("id"));
  };

  app.get("/projects/:id", can("projects.view"), async (request) => {
    const id = paramId(request.params.id);
    return { data: { ...(await findProject(request.auth, id)), members: await members(id) } };
  });

  app.put("/projects/:id", can("projects.manage"), async (request) => {
    const { auth } = request;
    const id = paramId(request.params.id);
    const current = await findProject(auth, id);
    const input = parse(updateProjectSchema, request.body);
    if (input.name && input.name.toLowerCase() !== current.name.toLowerCase() && (await nameTaken(auth.organizationId, input.name, id))) {
      throw new ValidationError({ name: ["يوجد مشروع بنفس الاسم."] });
    }
    const patch = {};
    for (const k of ["name", "description", "status", "start_date", "end_date"]) if (input[k] !== undefined) patch[k] = input[k];
    // The merge must still leave the dates in order (the schema only sees what was sent).
    const start = patch.start_date !== undefined ? patch.start_date : current.start_date;
    const end = patch.end_date !== undefined ? patch.end_date : current.end_date;
    if (start && end && end < start) throw new ValidationError({ end_date: ["تاريخ النهاية يجب ألا يسبق تاريخ البداية."] });
    if (Object.keys(patch).length) await db("projects").where({ id, organization_id: auth.organizationId }).update({ ...patch, updated_at: nowIso() });
    return { data: { ...(await findProject(auth, id)), members: await members(id) } };
  });

  // Replaces the whole team: employees and supervisors (the admin does not need to be listed).
  app.put("/projects/:id/members", can("projects.manage"), async (request) => {
    const { auth } = request;
    const id = paramId(request.params.id);
    const project = await findProject(auth, id);
    const input = parse(membersSchema, request.body);
    const team = new Map(input.members.map((m) => [m.user_id, m.project_role])); // a repeated user: the last entry wins
    if (team.size) {
      const active = await db("users").where({ organization_id: auth.organizationId, status: "active" }).whereIn("id", [...team.keys()]).pluck("id");
      const unknown = [...team.keys()].filter((u) => !active.includes(u));
      if (unknown.length) throw new ValidationError({ members: ["بعض الموظفين غير موجودين أو غير نشطين."] });
    }
    const before = new Set(await db("project_members").where({ project_id: id }).pluck("user_id"));
    await db.transaction(async (trx) => {
      await trx("project_members").where({ project_id: id }).del();
      if (team.size) await trx("project_members").insert([...team].map(([user_id, project_role]) => ({ project_id: id, user_id, project_role, created_at: nowIso() })));
    });
    const added = [...team.keys()].filter((u) => !before.has(u) && u !== auth.userId);
    await notifyUsers(db, { organizationId: auth.organizationId, userIds: added, title: "تمت إضافتك إلى مشروع", message: project.name, type: "system", link: `/dashboard/projects/${id}` });
    return { data: { ...(await findProject(auth, id)), members: await members(id) } };
  });

  // --------------------------------------------------------------------------- beneficiaries
  async function findBeneficiary(auth, id, opts) {
    const b = await db("beneficiaries").where({ id, organization_id: auth.organizationId }).first();
    if (!b) throw notFound("المستفيد غير موجود.");
    await assertProjectAccess(db, auth, b.project_id, opts); // 404 for someone outside the team
    return b;
  }

  const duplicateId = () => new ValidationError({ national_id: ["هذا المستفيد مسجل مسبقاً في المشروع."] });
  const idTaken = async (projectId, nationalId, exceptId = null) => {
    if (!nationalId) return false;
    const qb = db("beneficiaries").where({ project_id: projectId, national_id: nationalId });
    if (exceptId) qb.whereNot({ id: exceptId });
    return Boolean(await qb.first("id"));
  };

  app.get("/projects/:id/beneficiaries", can("beneficiaries.view"), async (request) => {
    const projectId = paramId(request.params.id);
    await assertProjectAccess(db, request.auth, projectId);
    const q = request.query;
    const qb = db("beneficiaries").where({ organization_id: request.auth.organizationId, project_id: projectId });
    if (hasFilter(q.status)) qb.where({ status: String(q.status) });
    if (hasFilter(q.region)) qb.where({ region: String(q.region) });
    applySearch(qb, q.search, ["full_name", "national_id", "code", "phone"]);
    qb.orderBy([{ column: "created_at", order: "desc" }, { column: "id", order: "desc" }]);
    return paginate(qb, pageParams(q), (rows) => rows.map(toBeneficiary));
  });

  app.post("/projects/:id/beneficiaries", can("beneficiaries.edit"), async (request, reply) => {
    const { auth } = request;
    const projectId = paramId(request.params.id);
    await assertProjectAccess(db, auth, projectId);
    const input = parse(createBeneficiarySchema, request.body);
    if (await idTaken(projectId, input.national_id)) throw duplicateId();
    let id;
    try {
      id = await db.transaction(async (trx) => {
        const code = await nextCode(trx, auth.organizationId, "beneficiary", "BEN", { pad: 4 });
        const now = nowIso();
        const [{ id: newId }] = await trx("beneficiaries").insert(
          { organization_id: auth.organizationId, project_id: projectId, code, full_name: input.full_name, national_id: input.national_id ?? null, gender: input.gender ?? null, birth_date: input.birth_date ?? null, phone: input.phone ?? null, region: input.region ?? null, address: input.address ?? null, household_size: input.household_size ?? null, notes: input.notes ?? null, status: input.status, created_by: auth.userId, created_at: now, updated_at: now },
          ["id"],
        );
        return newId;
      });
    } catch (err) {
      if (isUnique(err)) throw duplicateId();
      throw err;
    }
    const b = await db("beneficiaries").where({ id }).first();
    return reply.status(201).send({ data: { ...toBeneficiary(b), attachments: [] } });
  });

  app.get("/beneficiaries/:id", can("beneficiaries.view"), async (request) => {
    const id = paramId(request.params.id);
    const b = await findBeneficiary(request.auth, id);
    return { data: { ...toBeneficiary(b), attachments: await listAttachments(db, request.auth.organizationId, "beneficiary", id) } };
  });

  app.put("/beneficiaries/:id", can("beneficiaries.edit"), async (request) => {
    const { auth } = request;
    const id = paramId(request.params.id);
    const b = await findBeneficiary(auth, id);
    const input = parse(updateBeneficiarySchema, request.body);
    if (input.national_id && input.national_id !== b.national_id && (await idTaken(b.project_id, input.national_id, id))) throw duplicateId();
    const patch = {};
    for (const k of ["full_name", "national_id", "gender", "birth_date", "phone", "region", "address", "household_size", "notes", "status"]) if (input[k] !== undefined) patch[k] = input[k];
    try {
      if (Object.keys(patch).length) await db("beneficiaries").where({ id }).update({ ...patch, updated_at: nowIso() });
    } catch (err) {
      if (isUnique(err)) throw duplicateId();
      throw err;
    }
    const fresh = await db("beneficiaries").where({ id }).first();
    return { data: { ...toBeneficiary(fresh), attachments: await listAttachments(db, auth.organizationId, "beneficiary", id) } };
  });

  // The beneficiary's file: ID copies, forms, photos … (any type, images included).
  app.post("/beneficiaries/:id/attachments", can("beneficiaries.edit"), async (request, reply) => {
    const id = paramId(request.params.id);
    await findBeneficiary(request.auth, id); // 404 before any bytes are read
    return reply.status(201).send({ data: await attachUploadedFile(app, request, { type: "beneficiary", id }) });
  });

  app.get("/beneficiaries/:id/attachments/:aid/download", can("beneficiaries.view"), async (request, reply) => {
    const id = paramId(request.params.id);
    await findBeneficiary(request.auth, id);
    return sendAttachment(app, reply, request.auth, { type: "beneficiary", id, attachmentId: paramId(request.params.aid) });
  });
}
