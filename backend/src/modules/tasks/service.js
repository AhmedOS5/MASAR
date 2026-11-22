// Tasks: listing, detail, create (also from a request), update with notifications and request-progress sync.
import { ValidationError, forbidden, notFound } from "../../lib/errors.js";
import { applySearch, hasFilter, pageParams, paginate } from "../../lib/pagination.js";
import { nextCode } from "../../lib/sequence.js";
import { iso, nowIso } from "../../lib/time.js";
import { activeMember } from "../auth/members.js";
import { notifyUsers } from "../notifications/service.js";
import { assertRowAccess, filterProject, resolveProjectField, scopeIds, visibleProjectIds } from "../projects/access.js";
import { syncRequestProgress } from "../requests/sync.js";
import { listAttachments } from "../shared/attachments.js";
import { ASSIGNEE_FIELDS } from "./schema.js";

const DELETED_USER = "مستخدم محذوف";
const link = (id) => `/dashboard/tasks/${id}`;

export function createTaskService({ db }) {
  const base = (organizationId) =>
    db("tasks")
      .leftJoin("users as a", "a.id", "tasks.assignee_id")
      .leftJoin("roles as ar", "ar.id", "a.role_id")
      .leftJoin("users as c", "c.id", "tasks.creator_id")
      .leftJoin("requests as rq", "rq.id", "tasks.request_id")
      .leftJoin("projects as pr", "pr.id", "tasks.project_id")
      .where("tasks.organization_id", organizationId);

  const COLUMNS = ["tasks.*", "a.name as assignee_name", "ar.title as assignee_role", "c.name as creator_name", "rq.code as request_code", "rq.title as request_title", "pr.name as project_name"];

  const toTask = (t) => ({
    id: t.id,
    code: t.code,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    department: t.department,
    type: t.type,
    assignee_id: t.assignee_id,
    assignee: t.assignee_id ? { id: t.assignee_id, name: t.assignee_name, role: t.assignee_role ?? null } : null,
    creator: { name: t.creator_name ?? DELETED_USER },
    due_date: t.due_date,
    progress: t.progress,
    request: t.request_id ? { id: t.request_id, code: t.request_code, title: t.request_title } : null,
    project_id: t.project_id,
    project: { id: t.project_id, name: t.project_name },
    created_at: iso(t.created_at),
    updated_at: iso(t.updated_at),
  });

  const find = async (organizationId, id) => {
    const t = await base(organizationId).where("tasks.id", id).first(COLUMNS);
    if (!t) throw notFound("المهمة غير موجودة.");
    return t;
  };

  /** `find` + the caller must reach the task's project (404 otherwise). The caller's project role is returned as `role`. */
  const findFor = async (auth, id) => {
    const t = await find(auth.organizationId, id);
    return { task: t, role: await assertRowAccess(db, auth, t.project_id) };
  };

  /** The assignee must be an active member and part of the project's team (422 on assignee_id). */
  async function assertAssignee(organizationId, assigneeId, projectId) {
    if (assigneeId == null) return;
    if (!(await activeMember(db, organizationId, assigneeId))) throw new ValidationError({ assignee_id: ["المسؤول المحدد غير موجود."] });
    if (!(await db("project_members").where({ project_id: projectId, user_id: assigneeId }).first("user_id"))) {
      throw new ValidationError({ assignee_id: ["المسؤول المحدد ليس ضمن فريق المشروع."] });
    }
  }

  async function list(auth, query) {
    const qb = scopeIds(base(auth.organizationId), await visibleProjectIds(db, auth), "tasks.project_id");
    if (hasFilter(query.project_id)) filterProject(qb, query.project_id, "tasks.project_id");
    for (const [param, column] of [["status", "tasks.status"], ["priority", "tasks.priority"], ["department", "tasks.department"]]) {
      if (hasFilter(query[param])) qb.where(column, String(query[param]));
    }
    if (hasFilter(query.assignee_id)) {
      const id = Number(query.assignee_id);
      if (Number.isInteger(id)) qb.where("tasks.assignee_id", id);
      else qb.whereRaw("1 = 0");
    }
    applySearch(qb, query.search, ["tasks.title", "tasks.code"]);
    qb.select(COLUMNS).orderBy([{ column: "tasks.created_at", order: "desc" }, { column: "tasks.id", order: "desc" }]);
    return paginate(qb, pageParams(query), (rows) => rows.map(toTask));
  }

  async function detail(auth, id) {
    const { task: t } = await findFor(auth, id);
    const [comments, attachments] = await Promise.all([
      db("task_comments as c")
        .leftJoin("users as u", "u.id", "c.author_id")
        .leftJoin("roles as ro", "ro.id", "u.role_id")
        .where("c.task_id", id)
        .orderBy("c.id")
        .select("c.id", "c.body", "c.created_at", "u.name as author_name", "ro.title as author_role"),
      listAttachments(db, auth.organizationId, "task", id),
    ]);
    return {
      ...toTask(t),
      comments: comments.map((c) => ({ id: c.id, author: { name: c.author_name ?? DELETED_USER, role: c.author_role ?? null }, body: c.body, created_at: iso(c.created_at) })),
      attachments,
    };
  }

  async function insertTask(trx, auth, fields) {
    const code = await nextCode(trx, auth.organizationId, "task", "TSK");
    const now = nowIso();
    const [{ id }] = await trx("tasks").insert(
      { organization_id: auth.organizationId, code, status: "todo", progress: 0, creator_id: auth.userId, created_at: now, updated_at: now, ...fields },
      ["id"],
    );
    return { id, code };
  }

  async function notifyAssignee(auth, taskId, title, assigneeId) {
    if (!assigneeId || assigneeId === auth.userId) return;
    await notifyUsers(db, { organizationId: auth.organizationId, userIds: [assigneeId], title: "تم إسناد مهمة إليك", message: title, type: "task", link: link(taskId) });
  }

  async function create(auth, input) {
    const projectId = await resolveProjectField(db, auth, input.project_id);
    await assertAssignee(auth.organizationId, input.assignee_id, projectId);
    const { id } = await db.transaction((trx) =>
      insertTask(trx, auth, {
        project_id: projectId,
        title: input.title,
        description: input.description ?? null,
        assignee_id: input.assignee_id ?? null,
        department: input.department ?? null,
        type: input.type ?? null,
        priority: input.priority,
        due_date: input.due_date ?? null,
      }),
    );
    await notifyAssignee(auth, id, input.title, input.assignee_id);
    return detail(auth, id);
  }

  /** POST /requests/{id}/tasks — a task pre-filled from the request, linked to it. */
  async function createFromRequest(auth, requestId) {
    const req = await db("requests").where({ id: requestId, organization_id: auth.organizationId }).first();
    if (!req) throw notFound("الطلب غير موجود.");
    await assertRowAccess(db, auth, req.project_id); // 404 outside the request's project
    const { id } = await db.transaction(async (trx) => {
      const made = await insertTask(trx, auth, {
        project_id: req.project_id,
        title: req.title,
        description: req.description,
        department: req.department,
        priority: req.priority,
        request_id: req.id,
      });
      await trx("request_activities").insert({ request_id: req.id, actor_id: auth.userId, kind: "created", text: `تم إنشاء المهمة ${made.code} من هذا الطلب.`, created_at: nowIso() });
      await syncRequestProgress(trx, auth.organizationId, req.id, auth.userId);
      return made;
    });
    return detail(auth, id);
  }

  async function update(auth, id, input) {
    const { task: current, role } = await findFor(auth, id);

    // Without `tasks.update` an assignee may only report progress on their own task. That right also
    // needs the supervisor role (or full project access): a plain member only reports on their own tasks.
    const mayEdit = auth.can("tasks.update") && (role === "admin" || role === "supervisor");
    if (!mayEdit) {
      const fields = Object.keys(input).filter((k) => input[k] !== undefined);
      if (current.assignee_id !== auth.userId || fields.some((k) => !ASSIGNEE_FIELDS.has(k))) throw forbidden();
    }
    if (input.assignee_id !== undefined) await assertAssignee(auth.organizationId, input.assignee_id, current.project_id);

    const patch = {};
    for (const k of ["title", "description", "assignee_id", "department", "type", "priority", "due_date", "status", "progress"]) {
      if (input[k] !== undefined) patch[k] = input[k];
    }
    if (patch.status === "done" && patch.progress === undefined) patch.progress = 100;
    if (patch.status !== undefined) {
      if (patch.status !== "done") patch.completed_at = null;
      else if (current.status !== "done") patch.completed_at = nowIso();
    }

    if (Object.keys(patch).length) {
      await db.transaction(async (trx) => {
        await trx("tasks").where({ id, organization_id: auth.organizationId }).update({ ...patch, updated_at: nowIso() });
        if (patch.status !== undefined && current.request_id) await syncRequestProgress(trx, auth.organizationId, current.request_id, auth.userId);
      });

      if (patch.assignee_id !== undefined && patch.assignee_id !== current.assignee_id) {
        await notifyAssignee(auth, id, patch.title ?? current.title, patch.assignee_id);
      }
      if (patch.status === "done" && current.status !== "done" && current.creator_id && current.creator_id !== auth.userId) {
        await notifyUsers(db, { organizationId: auth.organizationId, userIds: [current.creator_id], title: "تم إكمال مهمة أنشأتها", message: current.title, type: "task", link: link(id) });
      }
    }
    return detail(auth, id);
  }

  async function addComment(auth, id, body) {
    const { task: t } = await findFor(auth, id);
    const now = nowIso();
    const [c] = await db("task_comments").insert({ task_id: id, author_id: auth.userId, body, created_at: now }, ["id"]);
    const others = [t.assignee_id, t.creator_id].filter((u) => u && u !== auth.userId);
    await notifyUsers(db, { organizationId: auth.organizationId, userIds: others, title: "تعليق جديد على مهمة", message: `${auth.user.name}: ${body.slice(0, 120)}`, type: "task", link: link(id) });
    return { id: c.id, author: { name: auth.user.name, role: auth.user.roleTitle }, body, created_at: now };
  }

  const assertExists = async (auth, id) => {
    await findFor(auth, id);
  };

  return { list, detail, create, createFromRequest, update, addComment, assertExists };
}
