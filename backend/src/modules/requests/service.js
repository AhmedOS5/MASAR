// Requests: listing, detail, creation, approve/reject, comments. All queries are scoped by organization.
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { applySearch, hasFilter, pageParams, paginate } from "../../lib/pagination.js";
import { nextCode } from "../../lib/sequence.js";
import { iso, nowIso } from "../../lib/time.js";
import { writeAudit } from "../../lib/audit.js";
import { usersWithPermission } from "../auth/members.js";
import { notifyUsers } from "../notifications/service.js";
import { assertRowAccess, filterProject, resolveProjectField, scopeIds, visibleProjectIds } from "../projects/access.js";
import { listAttachments } from "../shared/attachments.js";
import { REQUEST_STATUSES } from "./schema.js";

const DELETED_USER = "مستخدم محذوف";
const link = (id) => `/dashboard/requests/${id}`;
export const SELF_DECISION_MESSAGE = "لا يمكنك البت في طلب قدّمته بنفسك؛ يقرره شخص آخر (فصل المهام).";

export function createRequestService({ db }) {
  const base = (organizationId) =>
    db("requests")
      .leftJoin("users as u", "u.id", "requests.requester_id")
      .leftJoin("projects as pr", "pr.id", "requests.project_id")
      .where("requests.organization_id", organizationId);

  const COLUMNS = ["requests.*", "u.name as requester_name", "pr.name as project_name"];

  const toRequest = (r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    status: r.status,
    priority: r.priority,
    type: r.type,
    department: r.department,
    description: r.description,
    amount: r.amount,
    requester: { id: r.requester_id, name: r.requester_name ?? DELETED_USER },
    project_id: r.project_id,
    project: { id: r.project_id, name: r.project_name },
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
    ...(r.rejection_reason ? { rejection_reason: r.rejection_reason } : {}),
  });

  const find = async (organizationId, id) => {
    const r = await base(organizationId).where("requests.id", id).first(COLUMNS);
    if (!r) throw notFound("الطلب غير موجود.");
    return r;
  };

  /** `find` + the caller must reach the request's project (404 otherwise; a plain member gets 403 when `supervisor`). */
  const findFor = async (auth, id, opts) => {
    const r = await find(auth.organizationId, id);
    await assertRowAccess(db, auth, r.project_id, opts);
    return r;
  };

  async function list(auth, query) {
    const ids = await visibleProjectIds(db, auth);
    const filtered = (withStatus) => {
      const qb = scopeIds(base(auth.organizationId), ids, "requests.project_id");
      if (hasFilter(query.project_id)) filterProject(qb, query.project_id, "requests.project_id");
      if (hasFilter(query.priority)) qb.where("requests.priority", String(query.priority));
      if (withStatus && hasFilter(query.status)) qb.where("requests.status", String(query.status));
      return applySearch(qb, query.search, ["requests.title", "requests.code"]);
    };

    // Tab badges: counts per status for the current search/priority, regardless of the selected status tab.
    const grouped = await filtered(false).clearSelect().select("requests.status").count({ n: "*" }).groupBy("requests.status");
    const status_counts = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0]));
    for (const g of grouped) status_counts[g.status] = Number(g.n);

    const qb = filtered(true).select(COLUMNS).orderBy([{ column: "requests.created_at", order: "desc" }, { column: "requests.id", order: "desc" }]);
    return paginate(qb, pageParams(query), (rows) => rows.map(toRequest), { status_counts });
  }

  async function detail(auth, id) {
    const r = await findFor(auth, id);
    const [comments, activities, attachments] = await Promise.all([
      db("request_comments as c")
        .leftJoin("users as u", "u.id", "c.author_id")
        .leftJoin("roles as ro", "ro.id", "u.role_id")
        .where("c.request_id", id)
        .orderBy("c.id")
        .select("c.id", "c.body", "c.created_at", "u.name as author_name", "ro.title as author_role"),
      db("request_activities").where({ request_id: id }).orderBy("id").select("id", "text", "kind", "created_at"),
      listAttachments(db, auth.organizationId, "request", id),
    ]);
    return {
      ...toRequest(r),
      comments: comments.map((c) => ({ id: c.id, author: { name: c.author_name ?? DELETED_USER, role: c.author_role ?? null }, body: c.body, created_at: iso(c.created_at) })),
      attachments,
      activities: activities.map((a) => ({ id: a.id, text: a.text, kind: a.kind, created_at: iso(a.created_at) })),
    };
  }

  async function create(auth, input) {
    const projectId = await resolveProjectField(db, auth, input.project_id);
    const id = await db.transaction(async (trx) => {
      const code = await nextCode(trx, auth.organizationId, "request", "REQ");
      const now = nowIso();
      const [{ id: newId }] = await trx("requests").insert(
        {
          organization_id: auth.organizationId,
          code,
          title: input.title,
          status: "pending",
          priority: input.priority,
          type: input.type,
          department: input.department ?? null,
          description: input.description ?? null,
          amount: input.amount ?? null,
          project_id: projectId,
          requester_id: auth.userId,
          created_at: now,
          updated_at: now,
        },
        ["id"],
      );
      await trx("request_activities").insert({ request_id: newId, actor_id: auth.userId, kind: "created", text: "تم إنشاء الطلب وهو بانتظار الموافقة.", created_at: now });
      return newId;
    });

    // only those who may decide it: the project's supervisors and the people with full project access (never the requester)
    const deciders = new Set([
      ...(await db("project_members").where({ project_id: projectId, project_role: "supervisor" }).pluck("user_id")),
      ...(await usersWithPermission(db, auth.organizationId, "projects.manage")),
    ]);
    const approvers = (await usersWithPermission(db, auth.organizationId, "requests.approve")).filter((u) => u !== auth.userId && deciders.has(u));
    await notifyUsers(db, {
      organizationId: auth.organizationId,
      userIds: approvers,
      title: "طلب جديد بانتظار الموافقة",
      message: `${input.title} — قدّمه ${auth.user.name}`,
      type: "task",
      link: link(id),
    });
    return detail(auth, id);
  }

  /**
   * Atomic pending -> approved|rejected; a second decision (or a concurrent one) gets 409.
   * Separation of duties: nobody decides a request they submitted themselves (403), whatever their rank.
   */
  async function decide(auth, id, { status, activityText, activityKind, reason = null }) {
    const now = nowIso();
    const current = await findFor(auth, id, { supervisor: true }); // 404 first; only the project's supervisors decide
    if (current.requester_id === auth.userId) throw forbidden(SELF_DECISION_MESSAGE);
    await db.transaction(async (trx) => {
      const moved = await trx("requests")
        .where({ id, organization_id: auth.organizationId, status: "pending" })
        .update({ status, decided_by: auth.userId, decided_at: now, rejection_reason: reason, updated_at: now });
      if (!moved) throw conflict("تم البت في هذا الطلب مسبقاً.");
      await trx("request_activities").insert({ request_id: id, actor_id: auth.userId, kind: activityKind, text: activityText, created_at: now });
      await writeAudit(trx, {
        organizationId: auth.organizationId, actorId: auth.userId, action: `request.${status}`, entityType: "request", entityId: id,
        meta: { project_id: current.project_id, requester_id: current.requester_id, ...(reason ? { reason } : {}) },
      });
    });
    return id;
  }

  async function approve(auth, id) {
    await decide(auth, id, { status: "approved", activityKind: "reviewed", activityText: `تمت الموافقة على الطلب بواسطة ${auth.user.name}.` });
    const r = await find(auth.organizationId, id);
    if (r.requester_id && r.requester_id !== auth.userId) {
      await notifyUsers(db, { organizationId: auth.organizationId, userIds: [r.requester_id], title: "تمت الموافقة على طلبك", message: r.title, type: "system", link: link(id) });
    }
    return detail(auth, id);
  }

  async function reject(auth, id, reason) {
    await decide(auth, id, { status: "rejected", activityKind: "rejected", activityText: `رُفض الطلب بواسطة ${auth.user.name}: ${reason}`, reason });
    const r = await find(auth.organizationId, id);
    if (r.requester_id && r.requester_id !== auth.userId) {
      await notifyUsers(db, { organizationId: auth.organizationId, userIds: [r.requester_id], title: "تم رفض طلبك", message: `${r.title} — السبب: ${reason}`, type: "alert", link: link(id) });
    }
    return detail(auth, id);
  }

  async function addComment(auth, id, body) {
    const r = await findFor(auth, id);
    const now = nowIso();
    const [c] = await db("request_comments").insert({ request_id: id, author_id: auth.userId, body, created_at: now }, ["id"]);
    if (r.requester_id && r.requester_id !== auth.userId) {
      await notifyUsers(db, { organizationId: auth.organizationId, userIds: [r.requester_id], title: "تعليق جديد على طلبك", message: `${auth.user.name}: ${body.slice(0, 120)}`, type: "system", link: link(id) });
    }
    return { id: c.id, author: { name: auth.user.name, role: auth.user.roleTitle }, body, created_at: now };
  }

  /** Throws 404 unless the request belongs to the caller's organization. */
  const assertExists = async (auth, id) => {
    await findFor(auth, id);
  };

  return { list, detail, create, approve, reject, addComment, assertExists, find };
}
