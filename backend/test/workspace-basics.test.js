import { afterEach, describe, expect, it } from "vitest";
import { testApp, signedInAdmin, newcomer, member, makeProject, bearer } from "./helpers.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const get = (url, headers) => app.inject({ url, headers });
const send = (method, url, payload, headers) => app.inject({ method, url, payload, headers });
const other = (over = {}) => signedInAdmin(app, { admin_email: "boss@other.org", organization_name: "B", organization_email: "x@other.org", ...over });
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const DAY = 86_400_000;

describe("GET /options", () => {
  it("returns every list the UI needs, defaults included, plus active employees", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    await member(app, a, { email: "m@org.org", name: "منى" });
    const inactive = await member(app, a, { email: "gone@org.org", name: "غادر" });
    await app.db("users").where({ id: inactive.userId }).update({ status: "inactive" });

    const res = await get("/options", a.headers);
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    for (const k of ["departments", "request_types", "task_types", "projects", "sectors", "regions", "activity_types", "complaint_types", "channels", "report_types", "periods", "employees"]) {
      expect(Array.isArray(d[k]), k).toBe(true);
    }
    expect(d.departments).toContain("المالية");
    expect(d.periods).toHaveLength(4);
    expect(d.projects).toEqual([]); // no defaults: created through PUT /options/projects
    expect(d.employees.map((e) => e.label).sort()).toEqual(["admin", "منى"].sort());
    expect(d.employees[0]).toEqual({ value: expect.any(Number), label: expect.any(String) });
  });

  it("returns {value,label} for options that have a label and is tenant-scoped", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const b = await other();
    await app.db("options").insert({ organization_id: a.organizationId, kind: "projects", value: "P1", label: "مشروع 1", sort_order: 0 });
    await app.db("options").insert({ organization_id: b.organizationId, kind: "projects", value: "SECRET", sort_order: 0 });
    expect((await get("/options", a.headers)).json().data.projects).toEqual([{ value: "P1", label: "مشروع 1" }]);
    expect(JSON.stringify((await get("/options", a.headers)).json())).not.toContain("SECRET");
  });

  it("401 anonymous, 403 for an organization that is not approved yet", async () => {
    app = await testApp();
    const n = await newcomer(app);
    expect((await get("/options")).statusCode).toBe(401);
    expect((await get("/options", n.headers)).statusCode).toBe(403);
  });
});

describe("PUT /options/:kind", () => {
  it("replaces the list (trimmed, de-duplicated, ordered) for the caller's organization only", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const b = await other();
    const res = await send("PUT", "/options/projects", { values: ["  مشروع ألف ", "مشروع باء", "مشروع ألف"] }, a.headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual(["مشروع ألف", "مشروع باء"]);
    expect((await get("/options", a.headers)).json().data.projects).toEqual(["مشروع ألف", "مشروع باء"]);
    expect((await get("/options", b.headers)).json().data.projects).toEqual([]);

    await send("PUT", "/options/projects", { values: ["فقط"] }, a.headers);
    expect((await get("/options", a.headers)).json().data.projects).toEqual(["فقط"]);
    await send("PUT", "/options/projects", { values: [] }, a.headers);
    expect((await get("/options", a.headers)).json().data.projects).toEqual([]);
  });

  it("needs settings.manage", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const plain = await member(app, a, { permissions: ["requests.view"] });
    const mgr = await member(app, a, { email: "mgr@org.org", permissions: ["settings.manage"] });
    expect((await send("PUT", "/options/projects", { values: ["x"] }, plain.headers)).statusCode).toBe(403);
    expect((await send("PUT", "/options/projects", { values: ["x"] }, mgr.headers)).statusCode).toBe(200);
  });

  it("404 for unknown kinds (incl. employees), 422 for bad bodies, nothing changes on failure", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    await send("PUT", "/options/projects", { values: ["keep"] }, a.headers);
    expect((await send("PUT", "/options/employees", { values: ["x"] }, a.headers)).statusCode).toBe(404);
    expect((await send("PUT", "/options/nope", { values: ["x"] }, a.headers)).statusCode).toBe(404);
    for (const body of [{}, { values: "x" }, { values: [""] }, { values: [1] }, { values: Array.from({ length: 201 }, (_, i) => `v${i}`) }]) {
      expect((await send("PUT", "/options/projects", body, a.headers)).statusCode, JSON.stringify(body).slice(0, 30)).toBe(422);
    }
    expect((await get("/options", a.headers)).json().data.projects).toEqual(["keep"]);
  });
});

describe("units", () => {
  it("lists the catalog with the organization's state (core on by default, in-development locked)", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const res = await get("/units", a.headers);
    expect(res.statusCode).toBe(200);
    const { data, meta } = res.json();
    expect(meta.total).toBe(data.length);
    expect(data.map((u) => [u.id, u.status, u.tier])).toEqual([
      [1, "active", "core"],
      [2, "active", "core"],
      [3, "in_development", "optional"],
    ]);
    expect(data[0]).toMatchObject({ title: "المتابعة والتقييم", icon: "bar-chart", href: "/dashboard/meal", screens_count: 5, roles_count: 2 });
  });

  it("PATCH toggles per organization and returns the updated unit", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const b = await other();
    const off = await send("PATCH", "/units/1", { enabled: false }, a.headers);
    expect(off.statusCode).toBe(200);
    expect(off.json().data).toMatchObject({ id: 1, status: "inactive" });
    const status = async (u, id) => (await get("/units", u.headers)).json().data.find((x) => x.id === id).status;
    expect(await status(a, 1)).toBe("inactive");
    expect(await status(b, 1)).toBe("active"); // other tenant untouched

    expect((await send("PATCH", "/units/1", { enabled: true }, a.headers)).json().data.status).toBe("active");
    // idempotent
    expect((await send("PATCH", "/units/1", { enabled: true }, a.headers)).statusCode).toBe(200);
    expect(Number((await app.db("org_units").count({ n: "*" }).first()).n)).toBe(1);
  });

  it("an enabled unit that needs setup reports setup_required", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    await app.db("org_units").insert({ organization_id: a.organizationId, unit_id: 2, enabled: true, setup_required: true });
    expect((await get("/units", a.headers)).json().data.find((u) => u.id === 2).status).toBe("setup_required");
    await send("PATCH", "/units/2", { enabled: false }, a.headers);
    expect((await get("/units", a.headers)).json().data.find((u) => u.id === 2).status).toBe("inactive");
  });

  it("rejects: in-development unit (422), unknown/non-numeric id (404), bad body (422)", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const dev = await send("PATCH", "/units/3", { enabled: true }, a.headers);
    expect(dev.statusCode).toBe(422);
    expect(dev.json().message).toMatch(/قيد التطوير/);
    expect((await send("PATCH", "/units/99", { enabled: true }, a.headers)).statusCode).toBe(404);
    expect((await send("PATCH", "/units/x", { enabled: true }, a.headers)).statusCode).toBe(404);
    for (const body of [{}, { enabled: "true" }, { enabled: 1 }, { enabled: null }]) {
      expect((await send("PATCH", "/units/1", body, a.headers)).statusCode, JSON.stringify(body)).toBe(422);
    }
    expect((await get("/units", a.headers)).json().data[0].status).toBe("active"); // nothing changed
  });

  it("viewing needs units.view, switching needs units.manage", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const none = await member(app, a, { email: "n@org.org" });
    const viewer = await member(app, a, { email: "v@org.org", permissions: ["units.view"] });
    expect((await get("/units", none.headers)).statusCode).toBe(403);
    expect((await get("/units", viewer.headers)).statusCode).toBe(200);
    expect((await send("PATCH", "/units/1", { enabled: false }, viewer.headers)).statusCode).toBe(403);
    expect((await get("/units")).statusCode).toBe(401);
  });
});

describe("notifications", () => {
  async function seed(a, b) {
    const rows = [];
    const add = (org, user, over) => rows.push({ organization_id: org, user_id: user, title: "t", message: "m", type: "system", is_read: false, created_at: ago(1000), ...over });
    for (let i = 0; i < 12; i++) add(a.organizationId, a.userId, { title: `n${i}`, created_at: ago((20 - i) * 1000) }); // n11 is the newest
    add(a.organizationId, a.userId, { title: "read one", is_read: true, link: "/dashboard/tasks/1", type: "task" });
    add(a.organizationId, b.userId, { title: "someone else's" });
    await app.db("notifications").insert(rows);
  }

  it("lists only my notifications, newest first, paginated, with unread_count", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const m = await member(app, a);
    await seed(a, m);
    const first = (await get("/notifications?per_page=5", a.headers)).json();
    expect(first.meta).toMatchObject({ total: 13, per_page: 5, last_page: 3, current_page: 1, unread_count: 12 });
    expect(first.data).toHaveLength(5);
    expect(first.data[0].title).toBe("read one"); // created last (ago 1s)
    expect(first.data[1].title).toBe("n11");
    expect(first.data[0]).toMatchObject({ is_read: true, type: "task", link: "/dashboard/tasks/1", created_at: expect.stringMatching(/Z$/) });
    expect(first.data[1].is_read).toBe(false);
    expect("link" in first.data[1]).toBe(false);
    const all = (await get("/notifications?per_page=100", a.headers)).json().data;
    expect(all.some((n) => n.title === "someone else's")).toBe(false);

    expect((await get("/notifications", m.headers)).json().meta).toMatchObject({ total: 1, unread_count: 1 });
  });

  it("marks one as read (idempotent) but never someone else's or another organization's", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const m = await member(app, a);
    const b = await other();
    await seed(a, m);
    await app.db("notifications").insert({ organization_id: b.organizationId, user_id: b.userId, title: "B's", type: "system", is_read: false, created_at: ago(5) });

    const mine = (await app.db("notifications").where({ user_id: a.userId, is_read: 0 }).first()).id;
    expect((await send("PATCH", `/notifications/${mine}/read`, undefined, a.headers)).json()).toEqual({ ok: true });
    expect((await send("PATCH", `/notifications/${mine}/read`, undefined, a.headers)).statusCode).toBe(200);
    expect((await app.db("notifications").where({ id: mine }).first()).is_read).toBeTruthy();

    const theirs = (await app.db("notifications").where({ user_id: m.userId }).first()).id;
    const bs = (await app.db("notifications").where({ organization_id: b.organizationId }).first()).id;
    expect((await send("PATCH", `/notifications/${theirs}/read`, undefined, a.headers)).statusCode).toBe(404);
    expect((await send("PATCH", `/notifications/${bs}/read`, undefined, a.headers)).statusCode).toBe(404);
    expect((await send("PATCH", "/notifications/abc/read", undefined, a.headers)).statusCode).toBe(404);
    expect((await app.db("notifications").where({ id: theirs }).first()).is_read).toBeFalsy();
  });

  it("read-all only touches my unread notifications", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const m = await member(app, a);
    await seed(a, m);
    const res = await send("POST", "/notifications/read-all", undefined, a.headers);
    expect(res.json()).toEqual({ ok: true, updated: 12 });
    expect((await send("POST", "/notifications/read-all", undefined, a.headers)).json().updated).toBe(0);
    expect((await get("/notifications", a.headers)).json().meta.unread_count).toBe(0);
    expect((await get("/notifications", m.headers)).json().meta.unread_count).toBe(1);
  });

  it("401 anonymous, 403 before approval", async () => {
    app = await testApp();
    const n = await newcomer(app);
    expect((await get("/notifications")).statusCode).toBe(401);
    expect((await get("/notifications", n.headers)).statusCode).toBe(403);
    expect((await send("POST", "/notifications/read-all", undefined, { authorization: "Bearer nope" })).statusCode).toBe(401);
    void bearer;
  });
});

describe("GET /dashboard/summary", () => {
  it("is well-formed for a brand-new organization", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const { data } = (await get("/dashboard/summary", a.headers)).json();
    expect(data.stats.active_users).toMatchObject({ value: 1, trend: "up" });
    expect(data.stats.open_tasks).toEqual({ value: 0, trend_text: "بدون تغيير", trend: "neutral" });
    expect(data.stats.running_operations).toMatchObject({ value: 0, trend: "neutral" });
    expect(data.stats.important_alerts).toMatchObject({ value: 0, trend: "neutral" });
    expect(data.weekly_activity).toHaveLength(7);
    expect(data.weekly_activity.at(-1).date).toBe(new Date().toISOString().slice(0, 10));
    expect(data.weekly_activity.every((d) => d.requests === 0 && d.tasks === 0)).toBe(true);
    expect(data.active_units.map((u) => u.title)).toEqual(["المتابعة والتقييم", "العمليات الميدانية"]);
    expect(data).toMatchObject({ pending_approvals: [], recent_requests: [], open_tasks: [] });
  });

  async function fixture(a) {
    const project = await makeProject(app, a);
    const r = (code, over) => ({ organization_id: a.organizationId, project_id: project, code, title: `طلب ${code}`, status: "pending", priority: "high", type: "مشتريات", department: "المالية", amount: 1500.5, requester_id: a.userId, ...over });
    await app.db("requests").insert([
      r("REQ-001", { created_at: ago(5 * DAY) }),
      r("REQ-002", { created_at: ago(4000) }),
      r("REQ-003", { created_at: ago(3000) }),
      r("REQ-004", { created_at: ago(2000) }),
      r("REQ-005", { status: "approved", created_at: ago(1000) }),
      r("REQ-006", { status: "in_progress", created_at: ago(40 * DAY) }),
      r("REQ-007", { status: "completed", created_at: ago(40 * DAY) }),
    ]);
    const t = (code, over) => ({ organization_id: a.organizationId, project_id: project, code, title: `مهمة ${code}`, status: "todo", assignee_id: a.userId, due_date: "2026-12-01", ...over });
    await app.db("tasks").insert([
      t("TSK-001", { created_at: ago(10 * DAY) }),
      t("TSK-002", { status: "in_progress", created_at: ago(2000) }),
      t("TSK-003", { status: "done", created_at: ago(1000) }),
      t("TSK-004", { assignee_id: null, created_at: ago(500) }),
    ]);
    await app.db("notifications").insert([
      { organization_id: a.organizationId, user_id: a.userId, title: "x", type: "alert", is_read: false, created_at: ago(1) },
      { organization_id: a.organizationId, user_id: a.userId, title: "y", type: "task", is_read: false, created_at: ago(1) },
      { organization_id: a.organizationId, user_id: a.userId, title: "z", type: "task", is_read: true, created_at: ago(1) },
    ]);
    return project;
  }

  it("computes stats, weekly activity and the three lists from live data", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    await fixture(a);
    const { data } = (await get("/dashboard/summary", a.headers)).json();

    // stats
    expect(data.stats.active_users.value).toBe(1);
    expect(data.stats.open_tasks).toEqual({ value: 3, trend_text: "+3 هذا الأسبوع", trend: "up" }); // open: 001,002,004 · created this week: 002,003,004
    expect(data.stats.running_operations).toEqual({ value: 2, trend_text: "4 بانتظار الموافقة", trend: "neutral" }); // approved + in_progress
    expect(data.stats.important_alerts).toEqual({ value: 2, trend_text: "تتطلب إجراء", trend: "down" }); // my unread only

    // weekly activity: expected counts derived from the stored timestamps (robust around UTC midnight)
    const perDay = async (table) => {
      const m = {};
      for (const raw of await app.db(table).pluck("created_at")) {
        const s = raw instanceof Date ? raw.toISOString() : raw; // PostgreSQL returns Dates
        m[s.slice(0, 10)] = (m[s.slice(0, 10)] ?? 0) + 1;
      }
      return m;
    };
    const [rq, tk] = [await perDay("requests"), await perDay("tasks")];
    expect(data.weekly_activity).toHaveLength(7);
    for (const day of data.weekly_activity) {
      expect(day, day.date).toEqual({ date: day.date, requests: rq[day.date] ?? 0, tasks: tk[day.date] ?? 0 });
    }
    const windowTotal = (m) => data.weekly_activity.reduce((n, d) => n + (m[d.date] ?? 0), 0);
    expect(data.weekly_activity.reduce((n, d) => n + d.requests, 0)).toBe(windowTotal(rq));
    expect(data.weekly_activity.reduce((n, d) => n + d.requests, 0)).toBe(5); // 40-day-old requests are outside the window
    expect(data.weekly_activity.reduce((n, d) => n + d.tasks, 0)).toBe(3); // the 10-day-old task is outside it

    // lists
    expect(data.pending_approvals.map((r) => r.title)).toEqual(["طلب REQ-004", "طلب REQ-003", "طلب REQ-002"]);
    expect(data.pending_approvals[0]).toEqual({ id: expect.any(Number), title: "طلب REQ-004", amount: 1500.5, department: "المالية", created_at: expect.stringMatching(/Z$/) });
    expect(data.recent_requests.map((r) => r.code)).toEqual(["REQ-005", "REQ-004", "REQ-003", "REQ-002"]);
    expect(data.recent_requests[0]).toMatchObject({ code: "REQ-005", status: "approved", priority: "high", requester: { name: "admin" }, amount: 1500.5 });
    expect(data.open_tasks.map((t) => t.code)).toEqual(["TSK-004", "TSK-002", "TSK-001"]); // no done task, max 3
    expect(data.open_tasks[0]).toMatchObject({ assignee: null, due_date: "2026-12-01", status: "todo" });
    expect(data.open_tasks[1].assignee).toBe("admin");
  });

  it("hides the request/task lists from members without the matching view permission (stats stay)", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const project = await fixture(a);
    const none = await member(app, a, { email: "n@org.org" });
    const reqOnly = await member(app, a, { email: "r@org.org", permissions: ["requests.view"] });
    const taskOnly = await member(app, a, { email: "t@org.org", permissions: ["tasks.view"] });
    await app.db("project_members").insert([none, reqOnly, taskOnly].map((u) => ({ project_id: project, user_id: u.userId }))); // the counters follow project membership

    const s = async (u) => (await get("/dashboard/summary", u.headers)).json().data;
    const d0 = await s(none);
    expect(d0).toMatchObject({ pending_approvals: [], recent_requests: [], open_tasks: [] });
    expect(d0.stats.running_operations.value).toBe(2);
    const d1 = await s(reqOnly);
    expect(d1.recent_requests).toHaveLength(4);
    expect(d1.open_tasks).toEqual([]);
    const d2 = await s(taskOnly);
    expect(d2.open_tasks).toHaveLength(3);
    expect(d2.pending_approvals).toEqual([]);
    expect(d2.stats.important_alerts.value).toBe(0); // alerts are per user: the admin's unread ones are not theirs
  });

  it("never counts another organization's data", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const b = await other();
    await fixture(a);
    const { data } = (await get("/dashboard/summary", b.headers)).json();
    expect(data.stats.open_tasks.value).toBe(0);
    expect(data.stats.running_operations.value).toBe(0);
    expect(data.stats.important_alerts.value).toBe(0);
    expect(data.recent_requests).toEqual([]);
    expect(data.weekly_activity.every((d) => d.requests === 0 && d.tasks === 0)).toBe(true);
  });

  it("active_units follows the organization's switches; 401/403 guards apply", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    await send("PATCH", "/units/1", { enabled: false }, a.headers);
    expect((await get("/dashboard/summary", a.headers)).json().data.active_units.map((u) => u.id)).toEqual([2]);
    const n = await newcomer(app, { admin_email: "n@new.org", organization_name: "N" });
    expect((await get("/dashboard/summary")).statusCode).toBe(401);
    expect((await get("/dashboard/summary", n.headers)).statusCode).toBe(403);
  });
});
