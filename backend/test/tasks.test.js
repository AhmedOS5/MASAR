import { afterEach, describe, expect, it } from "vitest";
import { testApp, signedInAdmin, member, makeProject, multipart, PNG } from "./helpers.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const get = (url, headers) => app.inject({ url, headers });
const send = (method, url, payload, headers) => app.inject({ method, url, payload, headers });
const otherOrg = () => signedInAdmin(app, { admin_email: "boss@other.org", organization_name: "B", organization_email: "x@other.org" });
const notes = (userId) => app.db("notifications").where({ user_id: userId }).orderBy("id");

/** admin, a manager (tasks.*; supervises the project), two plain employees with tasks.view — all on one project */
let pid;
async function team() {
  const admin = await signedInAdmin(app);
  const manager = await member(app, admin, { email: "mgr@org.org", name: "مدير", permissions: ["tasks.view", "tasks.create", "tasks.update", "requests.view", "requests.create"] });
  const emp1 = await member(app, admin, { email: "e1@org.org", name: "موظف١", permissions: ["tasks.view"] });
  const emp2 = await member(app, admin, { email: "e2@org.org", name: "موظف٢", permissions: ["tasks.view"] });
  pid = await makeProject(app, admin, [{ user: manager, role: "supervisor" }, { user: emp1 }, { user: emp2 }]);
  return { admin, manager, emp1, emp2, project: pid };
}
const input = (over = {}) => ({ title: "إعداد التقرير", description: "تفاصيل", department: "المالية", type: "تدريب", priority: "high", due_date: "2026-12-01", project_id: pid, ...over });
const mk = async (user, over) => {
  const res = await send("POST", "/tasks", input(over), user.headers);
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json().data;
};

describe("POST /tasks", () => {
  it("creates a todo task with code, creator and assignee; notifies the assignee", async () => {
    app = await testApp();
    const { manager, emp1 } = await team();
    const res = await send("POST", "/tasks", input({ assignee_id: emp1.userId }), manager.headers);
    expect(res.statusCode).toBe(201);
    const t = res.json().data;
    expect(t).toMatchObject({
      code: "TSK-001", title: "إعداد التقرير", status: "todo", progress: 0, priority: "high", department: "المالية", type: "تدريب",
      due_date: "2026-12-01", creator: { name: "مدير" }, assignee: { id: emp1.userId, name: "موظف١" }, request: null, project_id: pid, project: { id: pid }, comments: [], attachments: [],
    });
    expect((await notes(emp1.userId))[0]).toMatchObject({ title: "تم إسناد مهمة إليك", type: "task", link: `/dashboard/tasks/${t.id}` });
    expect((await mk(manager)).code).toBe("TSK-002");
  });

  it("accepts the form's blanks (no assignee, no due date) and never notifies yourself", async () => {
    app = await testApp();
    const { manager } = await team();
    const t = await mk(manager, { assignee_id: "", due_date: "", department: "", type: "", description: "" });
    expect(t).toMatchObject({ assignee: null, assignee_id: null, due_date: null, department: null, type: null, description: null });
    const self = await mk(manager, { assignee_id: manager.userId });
    expect(self.assignee.id).toBe(manager.userId);
    expect(await notes(manager.userId)).toHaveLength(0);
  });

  it("ignores a status sent on create and fields clients must not set", async () => {
    app = await testApp();
    const { manager, admin } = await team();
    const t = await mk(manager, { status: "done", progress: 100, code: "X-1", creator_id: admin.userId, organization_id: 999, request_id: 1 });
    expect(t).toMatchObject({ status: "todo", progress: 0, code: "TSK-001", creator: { name: "مدير" }, request: null });
  });

  it("422: project/title required, bad priority, impossible dates, assignee from another org / inactive / unknown / off the project's team", async () => {
    app = await testApp();
    const { manager, emp1, admin } = await team();
    const b = await otherOrg();
    const offTeam = await member(app, admin, { email: "off@org.org", permissions: ["tasks.view"] });
    const foreignProject = await makeProject(app, b, [], { name: "غريب" });
    await app.db("users").where({ id: emp1.userId }).update({ status: "inactive" });
    const bad = [
      [{ project_id: undefined }, "project_id"], [{ project_id: null }, "project_id"], [{ project_id: "" }, "project_id"], [{ project_id: 9999 }, "project_id"],
      [{ project_id: foreignProject }, "project_id"], [{ assignee_id: offTeam.userId }, "assignee_id"],
      [{ title: "" }, "title"], [{ priority: "x" }, "priority"], [{ due_date: "2026-02-31" }, "due_date"], [{ due_date: "soon" }, "due_date"],
      [{ assignee_id: b.userId }, "assignee_id"], [{ assignee_id: emp1.userId }, "assignee_id"], [{ assignee_id: 9999 }, "assignee_id"], [{ assignee_id: "abc" }, "assignee_id"],
    ];
    for (const [over, field] of bad) {
      const r = await send("POST", "/tasks", input(over), manager.headers);
      expect(r.statusCode, JSON.stringify(over)).toBe(422);
      expect(r.json().errors[field], field).toBeTruthy();
    }
    expect(Number((await app.db("tasks").count({ n: "*" }).first()).n)).toBe(0);
  });

  it("needs tasks.create", async () => {
    app = await testApp();
    const { emp1 } = await team();
    expect((await send("POST", "/tasks", input(), emp1.headers)).statusCode).toBe(403);
    expect((await send("POST", "/tasks", input())).statusCode).toBe(401);
  });
});

describe("GET /tasks", () => {
  async function seed(admin, e1) {
    const rows = [];
    for (let i = 1; i <= 25; i++) {
      rows.push({
        organization_id: admin.organizationId, code: `TSK-${String(i).padStart(3, "0")}`, title: i === 5 ? "100% مهمة_خاصة" : `مهمة ${i}`,
        status: ["todo", "in_progress", "blocked", "done"][i % 4], priority: ["low", "medium", "high", "urgent"][i % 4],
        project_id: pid, department: ["العمليات", "المالية", "الموارد البشرية"][i % 3], assignee_id: i % 2 ? e1.userId : admin.userId, creator_id: admin.userId,
        created_at: new Date(Date.UTC(2026, 2, i)).toISOString(), updated_at: new Date().toISOString(),
      });
    }
    await app.db("tasks").insert(rows);
  }

  it("paginates newest first with meta and joined assignee/creator", async () => {
    app = await testApp();
    const { admin, emp1 } = await team();
    await seed(admin, emp1);
    const { data, meta } = (await get("/tasks?page=3&per_page=10", admin.headers)).json();
    expect(meta).toMatchObject({ total: 25, current_page: 3, last_page: 3 });
    expect(data.map((t) => t.code)).toEqual(["TSK-005", "TSK-004", "TSK-003", "TSK-002", "TSK-001"]);
    expect(data.find((t) => t.code === "TSK-005").assignee).toEqual({ id: emp1.userId, name: "موظف١", role: expect.any(String) });
    expect(data[0].creator).toEqual({ name: "admin" });
  });

  it("filters by status, priority, department, assignee_id, search; 'all' is ignored", async () => {
    app = await testApp();
    const { admin, emp1 } = await team();
    await seed(admin, emp1);
    const q = async (qs) => (await get(`/tasks?per_page=100&${qs}`, admin.headers)).json();
    expect((await q("status=done")).data.every((t) => t.status === "done")).toBe(true);
    expect((await q("priority=urgent")).data.every((t) => t.priority === "urgent")).toBe(true);
    expect((await q(`department=${encodeURIComponent("المالية")}`)).data.every((t) => t.department === "المالية")).toBe(true);
    const mine = await q(`assignee_id=${emp1.userId}`);
    expect(mine.meta.total).toBe(13);
    expect(mine.data.every((t) => t.assignee_id === emp1.userId)).toBe(true);
    expect((await q("assignee_id=all&status=all&priority=all&department=all&search=")).meta.total).toBe(25);
    expect((await q("assignee_id=abc")).meta.total).toBe(0);
    expect((await q("search=TSK-02")).meta.total).toBe(6);
    expect((await q(`search=${encodeURIComponent("100%")}`)).meta.total).toBe(1);
    expect((await q("status=done&priority=urgent")).data.every((t) => t.status === "done" && t.priority === "urgent")).toBe(true);
  });

  it("is organization-scoped and needs tasks.view", async () => {
    app = await testApp();
    const { admin, emp1 } = await team();
    const b = await otherOrg();
    await seed(admin, emp1);
    expect((await get("/tasks", b.headers)).json().meta.total).toBe(0);
    const none = await member(app, admin, { email: "none@org.org" });
    expect((await get("/tasks", none.headers)).statusCode).toBe(403);
    expect((await get("/tasks")).statusCode).toBe(401);
  });
});

describe("GET /tasks/:id", () => {
  it("returns comments, attachments and the linked request; 404 across organizations", async () => {
    app = await testApp();
    const { manager, emp1 } = await team();
    const b = await otherOrg();
    const t = await mk(manager, { assignee_id: emp1.userId });
    const res = await get(`/tasks/${t.id}`, emp1.headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: t.id, comments: [], attachments: [] });
    expect((await get(`/tasks/${t.id}`, b.headers)).statusCode).toBe(404);
    expect((await get("/tasks/999", emp1.headers)).statusCode).toBe(404);
    expect((await get("/tasks/T-1", emp1.headers)).statusCode).toBe(404);
  });
});

describe("PATCH /tasks/:id", () => {
  it("applies the edit form's full payload, including clearing the assignee and due date", async () => {
    app = await testApp();
    const { manager, emp1, emp2 } = await team();
    const t = await mk(manager, { assignee_id: emp1.userId });

    const edited = await send("PATCH", `/tasks/${t.id}`, {
      title: "عنوان جديد", description: "وصف جديد", assignee_id: String(emp2.userId), department: "العمليات", type: "متابعة",
      priority: "low", status: "in_progress", due_date: "2027-01-15",
    }, manager.headers);
    expect(edited.statusCode).toBe(200);
    expect(edited.json().data).toMatchObject({
      title: "عنوان جديد", description: "وصف جديد", assignee: { id: emp2.userId }, department: "العمليات", type: "متابعة",
      priority: "low", status: "in_progress", due_date: "2027-01-15",
    });
    expect((await notes(emp2.userId))[0].title).toBe("تم إسناد مهمة إليك");

    const cleared = await send("PATCH", `/tasks/${t.id}`, { assignee_id: "", due_date: "", department: "" }, manager.headers);
    expect(cleared.json().data).toMatchObject({ assignee: null, assignee_id: null, due_date: null, department: null, title: "عنوان جديد" });
  });

  it("an empty body changes nothing; unknown/forbidden fields are ignored (no mass assignment)", async () => {
    app = await testApp();
    const { manager, admin } = await team();
    const t = await mk(manager);
    expect((await send("PATCH", `/tasks/${t.id}`, {}, manager.headers)).statusCode).toBe(200);
    const res = await send("PATCH", `/tasks/${t.id}`, { code: "HACK", creator_id: admin.userId, organization_id: 999, request_id: 5, id: 77, title: "ok" }, manager.headers);
    expect(res.json().data).toMatchObject({ id: t.id, code: "TSK-001", creator: { name: "مدير" }, request: null, title: "ok" });
    expect((await app.db("tasks").first()).organization_id).toBe(admin.organizationId);
  });

  it("status done sets progress 100 unless progress is given; invalid values are 422", async () => {
    app = await testApp();
    const { manager } = await team();
    const t = await mk(manager);
    expect((await send("PATCH", `/tasks/${t.id}`, { status: "done" }, manager.headers)).json().data).toMatchObject({ status: "done", progress: 100 });
    const t2 = await mk(manager);
    expect((await send("PATCH", `/tasks/${t2.id}`, { status: "in_progress", progress: 40 }, manager.headers)).json().data).toMatchObject({ status: "in_progress", progress: 40 });
    for (const body of [{ progress: 101 }, { progress: -1 }, { progress: "abc" }, { progress: 1.5 }, { status: "finished" }, { priority: "x" }, { title: "" }, { due_date: "2026-13-01" }, { assignee_id: 9999 }]) {
      expect((await send("PATCH", `/tasks/${t.id}`, body, manager.headers)).statusCode, JSON.stringify(body)).toBe(422);
    }
  });

  it("an assignee without tasks.update may only change status/progress of their own task", async () => {
    app = await testApp();
    const { manager, emp1, emp2 } = await team();
    const t = await mk(manager, { assignee_id: emp1.userId });

    // the "mark complete" button
    const done = await send("PATCH", `/tasks/${t.id}`, { status: "done", progress: 100 }, emp1.headers);
    expect(done.statusCode).toBe(200);
    expect(done.json().data).toMatchObject({ status: "done", progress: 100 });
    expect((await send("PATCH", `/tasks/${t.id}`, { status: "in_progress", progress: 50 }, emp1.headers)).statusCode).toBe(200);

    // anything else, or someone else's task: 403
    expect((await send("PATCH", `/tasks/${t.id}`, { title: "mine now" }, emp1.headers)).statusCode).toBe(403);
    expect((await send("PATCH", `/tasks/${t.id}`, { assignee_id: emp2.userId }, emp1.headers)).statusCode).toBe(403);
    expect((await send("PATCH", `/tasks/${t.id}`, { status: "done" }, emp2.headers)).statusCode).toBe(403);
    expect((await get(`/tasks/${t.id}`, manager.headers)).json().data).toMatchObject({ title: "إعداد التقرير", status: "in_progress" });
  });

  it("notifies the creator when someone else completes the task, once", async () => {
    app = await testApp();
    const { manager, emp1 } = await team();
    const t = await mk(manager, { assignee_id: emp1.userId });
    await send("PATCH", `/tasks/${t.id}`, { status: "done" }, emp1.headers);
    await send("PATCH", `/tasks/${t.id}`, { status: "done" }, emp1.headers); // repeated: no second notification
    const n = (await notes(manager.userId)).filter((x) => x.title === "تم إكمال مهمة أنشأتها");
    expect(n).toHaveLength(1);
    expect(n[0].link).toBe(`/dashboard/tasks/${t.id}`);
  });

  it("404 for other organizations; 401/403 guards", async () => {
    app = await testApp();
    const { manager, admin } = await team();
    const b = await otherOrg();
    const t = await mk(manager);
    expect((await send("PATCH", `/tasks/${t.id}`, { title: "x" }, b.headers)).statusCode).toBe(404);
    expect((await send("PATCH", `/tasks/${t.id}`, { title: "x" })).statusCode).toBe(401);
    const none = await member(app, admin, { email: "none@org.org" });
    expect((await send("PATCH", `/tasks/${t.id}`, { title: "x" }, none.headers)).statusCode).toBe(403);
    expect((await app.db("tasks").first()).title).toBe("إعداد التقرير");
  });
});

describe("task comments and attachments", () => {
  it("comments are listed with author, and notify assignee + creator except the author", async () => {
    app = await testApp();
    const { manager, emp1 } = await team();
    const t = await mk(manager, { assignee_id: emp1.userId });
    const res = await send("POST", `/tasks/${t.id}/comments`, { body: "بدأت العمل" }, emp1.headers);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ body: "بدأت العمل", author: { name: "موظف١" } });
    expect((await get(`/tasks/${t.id}`, manager.headers)).json().data.comments).toEqual([expect.objectContaining({ body: "بدأت العمل", author: { name: "موظف١", role: expect.any(String) } })]);
    expect((await notes(manager.userId)).map((n) => n.title)).toContain("تعليق جديد على مهمة");
    expect((await notes(emp1.userId)).map((n) => n.title)).not.toContain("تعليق جديد على مهمة");
    expect((await send("POST", `/tasks/${t.id}/comments`, { body: "" }, emp1.headers)).statusCode).toBe(422);
  });

  it("attachments upload and download; tenant-safe", async () => {
    app = await testApp();
    const { manager, emp1 } = await team();
    const b = await otherOrg();
    const t = await mk(manager);
    const m = multipart([{ name: "file", filename: "صورة.png", type: "image/png", content: PNG }]);
    const up = await app.inject({ method: "POST", url: `/tasks/${t.id}/attachments`, payload: m.payload, headers: { ...emp1.headers, ...m.headers } });
    expect(up.statusCode).toBe(201);
    const att = up.json().data;
    expect(att).toMatchObject({ name: "صورة.png", mime: "image/png", size: PNG.length });
    expect((await get(`/tasks/${t.id}`, manager.headers)).json().data.attachments).toHaveLength(1);
    const dl = await get(`/tasks/${t.id}/attachments/${att.id}/download`, manager.headers);
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.equals(PNG)).toBe(true);
    expect((await get(`/tasks/${t.id}/attachments/${att.id}/download`, b.headers)).statusCode).toBe(404);
    // a request attachment id is not reachable through the task route
    expect((await get(`/tasks/${t.id}/attachments/9999/download`, manager.headers)).statusCode).toBe(404);
  });
});

describe("tasks created from a request, and the request's progress", () => {
  // the manager submits, the admin decides (separation of duties)
  const submit = async (manager, over) => (await send("POST", "/requests", { title: "p", type: "t", project_id: pid, ...over }, manager.headers)).json().data;
  async function approvedRequest(admin, manager) {
    const r = await submit(manager, { title: "تنفيذ مشروع", type: "لوجستيات", department: "العمليات", priority: "urgent", description: "وصف الطلب" });
    expect((await send("POST", `/requests/${r.id}/approve`, {}, admin.headers)).statusCode).toBe(200);
    return r;
  }
  const reqStatus = async (admin, id) => (await get(`/requests/${id}`, admin.headers)).json().data;

  it("copies title/description/priority/department and links the request", async () => {
    app = await testApp();
    const { admin, manager } = await team();
    const r = await approvedRequest(admin, manager);
    const res = await send("POST", `/requests/${r.id}/tasks`, {}, manager.headers);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      code: "TSK-001", title: "تنفيذ مشروع", description: "وصف الطلب", priority: "urgent", department: "العمليات", status: "todo",
      creator: { name: "مدير" }, assignee: null, request: { id: r.id, code: r.code, title: "تنفيذ مشروع" },
    });
    expect((await reqStatus(admin, r.id)).activities.map((a) => a.text).join("|")).toContain("TSK-001");
  });

  it("approved -> in_progress on the first task -> completed when all tasks are done -> back when reopened", async () => {
    app = await testApp();
    const { admin, manager } = await team();
    const r = await approvedRequest(admin, manager);
    expect((await reqStatus(admin, r.id)).status).toBe("approved");

    const t1 = (await send("POST", `/requests/${r.id}/tasks`, {}, manager.headers)).json().data;
    const t2 = (await send("POST", `/requests/${r.id}/tasks`, {}, manager.headers)).json().data;
    expect((await reqStatus(admin, r.id)).status).toBe("in_progress");

    await send("PATCH", `/tasks/${t1.id}`, { status: "done" }, manager.headers);
    expect((await reqStatus(admin, r.id)).status).toBe("in_progress"); // t2 still open
    await send("PATCH", `/tasks/${t2.id}`, { status: "done" }, manager.headers);
    const done = await reqStatus(admin, r.id);
    expect(done.status).toBe("completed");
    expect(done.activities.at(-1).text).toContain("مكتملاً");

    await send("PATCH", `/tasks/${t2.id}`, { status: "in_progress" }, manager.headers);
    expect((await reqStatus(admin, r.id)).status).toBe("in_progress");
    // editing something other than status never touches the request
    await send("PATCH", `/tasks/${t1.id}`, { title: "تعديل" }, manager.headers);
    expect((await reqStatus(admin, r.id)).status).toBe("in_progress");
  });

  it("pending and rejected requests keep their status when tasks are created/finished", async () => {
    app = await testApp();
    const { admin, manager } = await team();
    const pending = await submit(manager, { title: "p" });
    const t = (await send("POST", `/requests/${pending.id}/tasks`, {}, manager.headers)).json().data;
    await send("PATCH", `/tasks/${t.id}`, { status: "done" }, manager.headers);
    expect((await reqStatus(admin, pending.id)).status).toBe("pending");

    const rejected = await submit(manager, { title: "r" });
    await send("POST", `/requests/${rejected.id}/reject`, { reason: "no" }, admin.headers);
    const t2 = (await send("POST", `/requests/${rejected.id}/tasks`, {}, manager.headers)).json().data;
    await send("PATCH", `/tasks/${t2.id}`, { status: "done" }, manager.headers);
    expect((await reqStatus(admin, rejected.id)).status).toBe("rejected");
  });

  it("needs tasks.create and requests.view; 404 for unknown or foreign requests", async () => {
    app = await testApp();
    const { admin, manager, emp1 } = await team();
    const b = await otherOrg();
    const r = await approvedRequest(admin, manager);
    expect((await send("POST", `/requests/${r.id}/tasks`, {}, emp1.headers)).statusCode).toBe(403);
    const creatorOnly = await member(app, admin, { email: "c@org.org", permissions: ["tasks.create"] });
    expect((await send("POST", `/requests/${r.id}/tasks`, {}, creatorOnly.headers)).statusCode).toBe(403);
    expect((await send("POST", `/requests/${r.id}/tasks`, {}, b.headers)).statusCode).toBe(404);
    expect((await send("POST", "/requests/999/tasks", {}, manager.headers)).statusCode).toBe(404);
    expect(Number((await app.db("tasks").count({ n: "*" }).first()).n)).toBe(0);
  });
});
