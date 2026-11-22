import { afterEach, describe, expect, it } from "vitest";
import { testApp, signedInAdmin, member, newcomer, projectNamed } from "./helpers.js";
import { indicatorStatus, progressPercent } from "../src/modules/meal/indicators-core.js";
import { toCsv, parseCsv } from "../src/lib/csv.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const get = (url, headers) => app.inject({ url, headers });
const send = (method, url, payload, headers) => app.inject({ method, url, payload, headers });
const otherOrg = () => signedInAdmin(app, { admin_email: "boss@other.org", organization_name: "B", organization_email: "x@other.org" });
const notes = (userId) => app.db("notifications").where({ user_id: userId }).orderBy("id");
const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();
const dayOnly = (n) => daysAgo(n).slice(0, 10);

// every MEAL row belongs to a project: A and B, both with the manager and the viewer on the team
let A;
let B;
async function team() {
  const admin = await signedInAdmin(app);
  const manager = await member(app, admin, { email: "mgr@org.org", name: "مدير ميل", permissions: ["meal.view", "meal.manage"] });
  const viewer = await member(app, admin, { email: "view@org.org", name: "مشاهد", permissions: ["meal.view"] });
  A = await projectNamed(app, admin, "مشروع ألف", [{ user: manager }, { user: viewer }]);
  B = await projectNamed(app, admin, "مشروع باء", [{ user: manager }, { user: viewer }]);
  return { admin, manager, viewer };
}

describe("csv helpers", () => {
  it("quotes, escapes and neutralises formulas; round-trips through parseCsv", () => {
    const csv = toCsv([{ a: "x,y", b: 'say "hi"', c: "=1+1", d: null, e: "سطر\nثانٍ" }], ["a", "b", "c", "d", "e"].map((k) => ({ header: k, value: (r) => r[k] })));
    expect(csv.startsWith("﻿")).toBe(true);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(["a", "b", "c", "d", "e"]);
    expect(rows[1]).toEqual(["x,y", 'say "hi"', "'=1+1", "", "سطر\nثانٍ"]);
  });

  it("parseCsv copes with BOM, CRLF, blank lines and a missing final newline", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n\r\n3,4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
    expect(parseCsv("")).toEqual([]);
  });
});

describe("indicator status rules", () => {
  it("derives the status from the share of the target reached", () => {
    expect(indicatorStatus(100, 0)).toBe("needs_follow"); // nothing reported yet
    expect(indicatorStatus(100, 10)).toBe("delayed");
    expect(indicatorStatus(100, 39.9)).toBe("delayed");
    expect(indicatorStatus(100, 40)).toBe("needs_follow");
    expect(indicatorStatus(100, 69)).toBe("needs_follow");
    expect(indicatorStatus(100, 70)).toBe("on_track");
    expect(indicatorStatus(100, 99)).toBe("on_track");
    expect(indicatorStatus(100, 100)).toBe("achieved");
    expect(indicatorStatus(100, 250)).toBe("achieved");
    expect(progressPercent(200, 50)).toBe(25);
    expect(progressPercent(100, 500)).toBe(100);
    expect(progressPercent(0, 5)).toBe(0);
  });
});

describe("MEAL access control", () => {
  const READS = [
    "/meal/stats", "/meal/charts", "/meal/activity", "/meal/complaints", "/meal/complaints/stats", "/meal/complaints/insights", "/meal/complaints/export",
    "/meal/indicators", "/meal/indicators/stats", "/meal/indicators/insights", "/meal/indicators/export",
    "/meal/reports", "/meal/reports/stats", "/meal/reports/insights", "/meal/report-templates", "/meal/reports/export", "/meal/field-records",
  ];

  it("every read needs meal.view; anonymous gets 401; an unapproved organization gets 403", async () => {
    app = await testApp();
    const { admin, viewer } = await team();
    const none = await member(app, admin, { email: "n@org.org" });
    const pending = await newcomer(app, { admin_email: "p@new.org", organization_name: "P" });
    for (const url of READS) {
      expect((await get(url, viewer.headers)).statusCode, url).toBe(200);
      expect((await get(url, none.headers)).statusCode, url).toBe(403);
      expect((await get(url)).statusCode, url).toBe(401);
      expect((await get(url, pending.headers)).statusCode, url).toBe(403);
    }
  });

  it("writes need meal.manage", async () => {
    app = await testApp();
    const { viewer } = await team();
    const writes = [
      ["POST", "/meal/complaints", { type: "t", project_id: 1, channel: "c" }],
      ["PATCH", "/meal/complaints/1", { status: "closed" }],
      ["POST", "/meal/indicators", { code: "X", name: "n", project_id: 1, target: 1 }],
      ["PATCH", "/meal/indicators/1", { achieved: 1 }],
      ["POST", "/meal/reports", { title: "t", type: "t", project_id: 1 }],
      ["PATCH", "/meal/reports/1", { status: "approved" }],
      ["POST", "/meal/field-records", { status: "draft" }],
    ];
    for (const [method, url, body] of writes) expect((await send(method, url, body, viewer.headers)).statusCode, `${method} ${url}`).toBe(403);
  });

  it("switching the MEAL unit off locks every endpoint, switching it on restores them", async () => {
    app = await testApp();
    const { admin, manager } = await team();
    expect((await get("/meal/stats", manager.headers)).statusCode).toBe(200);
    await send("PATCH", "/units/1", { enabled: false }, admin.headers);
    for (const url of READS) {
      const r = await get(url, admin.headers);
      expect(r.statusCode, url).toBe(403);
      expect(r.json().message).toMatch(/غير مفعّلة/);
    }
    expect((await send("POST", "/meal/complaints", { type: "t", project_id: A, channel: "c" }, manager.headers)).statusCode).toBe(403);
    await send("PATCH", "/units/1", { enabled: true }, admin.headers);
    expect((await get("/meal/stats", manager.headers)).statusCode).toBe(200);
  });
});

describe("complaints", () => {
  const body = (over = {}) => ({ type: "تأخير توزيع", project_id: A, region: "غزة", channel: "الهاتف", priority: "medium", reporter_name: "أم أحمد", description: "وصف سري", ...over });
  const create = async (user, over) => (await send("POST", "/meal/complaints", body(over), user.headers)).json().data;

  it("creates with sequential FCRM codes, owner = creator, today's date; reporter details are not echoed", async () => {
    app = await testApp();
    const { manager } = await team();
    const res = await send("POST", "/meal/complaints", body(), manager.headers);
    expect(res.statusCode).toBe(201);
    const c = res.json().data;
    expect(c).toMatchObject({ code: "FCRM-900", type: "تأخير توزيع", project_id: A, project: "مشروع ألف", region: "غزة", channel: "الهاتف", priority: "medium", status: "new", owner: { id: manager.userId, name: "مدير ميل" }, received_at: new Date().toISOString().slice(0, 10) });
    expect(JSON.stringify(res.json())).not.toMatch(/أم أحمد|وصف سري/);
    expect((await app.db("complaints").first())).toMatchObject({ reporter_name: "أم أحمد", description: "وصف سري" });
    expect((await create(manager)).code).toBe("FCRM-901");
  });

  it("422 for missing type/project/channel or a bad priority; blank optional fields are fine", async () => {
    app = await testApp();
    const { manager } = await team();
    const r = await send("POST", "/meal/complaints", {}, manager.headers);
    expect(Object.keys(r.json().errors).sort()).toEqual(["channel", "project_id", "type"]);
    expect((await send("POST", "/meal/complaints", body({ priority: "urgent" }), manager.headers)).json().errors.priority).toBeTruthy();
    const ok = await create(manager, { region: "", priority: "", reporter_name: "", description: "" });
    expect(ok).toMatchObject({ region: null, priority: "medium" });
  });

  it("a sensitive complaint alerts the other MEAL managers, not the author", async () => {
    app = await testApp();
    const { admin, manager } = await team();
    const other = await member(app, admin, { email: "m2@org.org", permissions: ["meal.view", "meal.manage"] });
    await app.db("project_members").insert({ project_id: A, user_id: other.userId }); // only the project's own team is alerted
    const outsider = await member(app, admin, { email: "m3@org.org", permissions: ["meal.view", "meal.manage"] });
    await create(manager, { priority: "sensitive" });
    expect(await notes(outsider.userId)).toHaveLength(0);
    expect((await notes(other.userId))[0]).toMatchObject({ title: "شكوى حساسة جديدة", type: "alert", link: "/dashboard/meal/complaints" });
    expect(await notes(manager.userId)).toHaveLength(0);
    await create(manager, { priority: "low" });
    expect(await notes(other.userId)).toHaveLength(1); // non-sensitive: no alert
  });

  async function seed(admin) {
    const rows = [];
    for (let i = 0; i < 14; i++) {
      rows.push({
        organization_id: admin.organizationId, code: `FCRM-${900 + i}`, type: i === 3 ? "100% خاص" : "نقص مواد", project_id: [A, B][i % 2], region: ["غزة", "الضفة"][i % 2],
        channel: "الهاتف", priority: ["low", "medium", "high", "sensitive"][i % 4], status: ["new", "in_progress", "resolved", "closed"][(i + 1) % 4],
        received_at: dayOnly(14 - i), created_at: daysAgo(14 - i), updated_at: daysAgo(14 - i),
      });
    }
    await app.db("complaints").insert(rows);
  }

  it("lists newest first with pagination; filters by status, sensitive pseudo-status, project, region, priority, search", async () => {
    app = await testApp();
    const { admin, viewer } = await team();
    await seed(admin);
    const q = async (qs) => (await get(`/meal/complaints?per_page=50&${qs}`, viewer.headers)).json();
    const page = (await get("/meal/complaints?page=2&per_page=10", viewer.headers)).json();
    expect(page.meta).toMatchObject({ total: 14, current_page: 2, last_page: 2 });
    expect(page.data).toHaveLength(4);
    expect((await q("")).data[0].code).toBe("FCRM-913"); // most recent received_at first

    expect((await q("status=in_progress")).data.every((c) => c.status === "in_progress")).toBe(true);
    const sensitive = await q("status=sensitive");
    expect(sensitive.meta.total).toBe(3);
    expect(sensitive.data.every((c) => c.priority === "sensitive")).toBe(true); // any status
    expect((await q("project_id=" + B)).data.every((c) => c.project === "مشروع باء")).toBe(true);
    expect((await q("project_id=" + B)).meta.total).toBe(7);
    expect((await q("region=" + encodeURIComponent("الضفة"))).meta.total).toBe(7);
    expect((await q("priority=high")).data.every((c) => c.priority === "high")).toBe(true);
    expect((await q("status=all&project_id=all&region=all&priority=all&search=")).meta.total).toBe(14);
    expect((await q("search=FCRM-90")).meta.total).toBe(10);
    expect((await q(`search=${encodeURIComponent("100%")}`)).meta.total).toBe(1);
    expect((await q("status=bogus")).meta.total).toBe(0);
  });

  it("stats count by status; sensitive_open excludes resolved/closed", async () => {
    app = await testApp();
    const { admin, viewer } = await team();
    await seed(admin);
    const { data } = (await get("/meal/complaints/stats", viewer.headers)).json();
    const rows = await app.db("complaints");
    const n = (f) => rows.filter(f).length;
    expect(data).toEqual({
      total: 14, new: n((c) => c.status === "new"), in_progress: n((c) => c.status === "in_progress"), resolved: n((c) => c.status === "resolved"),
      sensitive: n((c) => c.priority === "sensitive"), sensitive_open: n((c) => c.priority === "sensitive" && ["new", "in_progress"].includes(c.status)),
    });
    expect((await get("/meal/complaints/stats", (await otherOrg()).headers)).json().data.total).toBe(0);
  });

  it("insights: close rate, open age, and alerts for sensitive-open and stale-new complaints", async () => {
    app = await testApp();
    const { admin, viewer } = await team();
    const empty = (await get("/meal/complaints/insights", viewer.headers)).json().data;
    expect(empty.alerts).toEqual([]);
    expect(empty.metrics.find((m) => m.label === "نسبة الإغلاق").value).toBe("—");

    const row = (code, over) => ({ organization_id: admin.organizationId, project_id: A, code, type: "t", priority: "medium", status: "new", received_at: dayOnly(0), ...over });
    await app.db("complaints").insert([
      row("FCRM-900", { status: "new", received_at: dayOnly(10) }), // stale new
      row("FCRM-901", { status: "in_progress", priority: "sensitive", received_at: dayOnly(2) }),
      row("FCRM-902", { status: "resolved" }),
      row("FCRM-903", { status: "closed" }),
    ]);
    const { metrics, alerts } = (await get("/meal/complaints/insights", viewer.headers)).json().data;
    const m = Object.fromEntries(metrics.map((x) => [x.label, x]));
    expect(m["الشكاوى المفتوحة"]).toMatchObject({ value: "2", level: "info" });
    expect(m["نسبة الإغلاق"]).toMatchObject({ value: "50%", level: "warning" });
    expect(m["متوسط عمر الشكاوى المفتوحة"].value).toBe("6.0 يوم");
    expect(m["الشكاوى الحساسة المفتوحة"]).toMatchObject({ value: "1", level: "danger" });
    expect(alerts.map((a) => a.level)).toEqual(["danger", "warning"]);
    expect(alerts[0].text).toContain("1 شكوى حساسة");
  });

  it("PATCH changes status freely (any → any) and can reassign the owner", async () => {
    app = await testApp();
    const { admin, manager, viewer } = await team();
    const c = await create(manager);
    for (const status of ["resolved", "new", "closed", "in_progress"]) {
      const r = await send("PATCH", `/meal/complaints/${c.id}`, { status }, manager.headers);
      expect(r.statusCode).toBe(200);
      expect(r.json().data.status).toBe(status);
    }
    const reassigned = await send("PATCH", `/meal/complaints/${c.id}`, { owner_id: String(viewer.userId) }, manager.headers);
    expect(reassigned.json().data.owner).toEqual({ id: viewer.userId, name: "مشاهد" });
    expect((await send("PATCH", `/meal/complaints/${c.id}`, { owner_id: "" }, manager.headers)).json().data.owner).toBeNull();
    void admin;
  });

  it("PATCH 422 for an invalid status, empty body, foreign owner; 404 for other organizations", async () => {
    app = await testApp();
    const { manager } = await team();
    const b = await otherOrg();
    const c = await create(manager);
    expect((await send("PATCH", `/meal/complaints/${c.id}`, { status: "done" }, manager.headers)).statusCode).toBe(422);
    expect((await send("PATCH", `/meal/complaints/${c.id}`, {}, manager.headers)).statusCode).toBe(422);
    expect((await send("PATCH", `/meal/complaints/${c.id}`, { owner_id: b.userId }, manager.headers)).json().errors.owner_id).toBeTruthy();
    expect((await send("PATCH", `/meal/complaints/${c.id}`, { status: "closed" }, b.headers)).statusCode).toBe(404);
    expect((await send("PATCH", "/meal/complaints/abc", { status: "closed" }, manager.headers)).statusCode).toBe(404);
    expect((await app.db("complaints").first()).status).toBe("new");
  });

  it("export is a CSV with Arabic headers/labels, honours filters, and cannot inject formulas", async () => {
    app = await testApp();
    const { manager } = await team();
    await create(manager, { type: "=HYPERLINK(\"http://evil\",\"x\")", priority: "sensitive" });
    await create(manager, { type: "نقص مواد", priority: "low" });
    const res = await get("/meal/complaints/export?status=sensitive", manager.headers);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="complaints\.csv"/);
    const rows = parseCsv(res.body);
    expect(rows[0]).toEqual(["الرمز", "النوع", "المشروع", "المنطقة", "قناة الاستلام", "الأولوية", "الحالة", "المسؤول", "تاريخ الاستلام"]);
    expect(rows).toHaveLength(2);
    expect(rows[1][1].startsWith("'=")).toBe(true);
    expect(rows[1][5]).toBe("حساسة");
    expect(rows[1][6]).toBe("جديدة");
    expect(res.body).not.toMatch(/وصف سري|أم أحمد/);
  });

  it("is organization-scoped", async () => {
    app = await testApp();
    const { manager } = await team();
    const b = await otherOrg();
    await create(manager);
    expect((await get("/meal/complaints", b.headers)).json().meta.total).toBe(0);
    expect((await get("/meal/complaints/export", b.headers)).body.trim().split("\r\n")).toHaveLength(1); // header only
  });
});

describe("MEAL is scoped to projects", () => {
  it("a member only reaches the MEAL data of the projects they work in; the admin reaches all", async () => {
    app = await testApp();
    const { admin, manager, viewer } = await team();
    const C = await projectNamed(app, admin, "مشروع جيم", [{ user: viewer }]); // the manager is NOT on this team
    await send("POST", "/meal/complaints", { type: "في جيم", project_id: C, channel: "c" }, admin.headers);
    await send("POST", "/meal/complaints", { type: "في ألف", project_id: A, channel: "c" }, admin.headers);
    const types = async (who, qs = "") => (await get("/meal/complaints?per_page=50" + qs, who.headers)).json().data.map((c) => c.type).sort();
    expect(await types(manager)).toEqual(["في ألف"]);
    expect(await types(viewer)).toEqual(["في أ" + "لف", "في جيم"].sort());
    expect(await types(admin)).toEqual(["في ألف", "في جيم"].sort());
    expect(await types(manager, "&project_id=" + C)).toEqual([]);
    expect((await get("/meal/complaints/stats", manager.headers)).json().data.total).toBe(1);
    expect((await get("/meal/stats", manager.headers)).json().data.active_projects.value).toBe(1);
    expect((await get("/meal/stats", admin.headers)).json().data.active_projects.value).toBe(2);
    expect(parseCsv((await get("/meal/complaints/export", manager.headers)).body)).toHaveLength(2); // header + one

    // writing: not into a project the person is not on (422), and not touching its rows (404)
    expect((await send("POST", "/meal/complaints", { type: "x", project_id: C, channel: "c" }, manager.headers)).json().errors.project_id).toBeTruthy();
    expect((await send("POST", "/meal/indicators", { code: "Z", name: "n", project_id: C, target: 1 }, manager.headers)).json().errors.project_id).toBeTruthy();
    expect((await send("POST", "/meal/reports", { title: "t", type: "t", project_id: C }, manager.headers)).json().errors.project_id).toBeTruthy();
    expect((await send("POST", "/meal/complaints", { type: "x", channel: "c" }, manager.headers)).json().errors.project_id).toEqual(["الحقل مطلوب."]);
    const inC = (await app.db("complaints").where({ project_id: C }).first()).id;
    expect((await send("PATCH", "/meal/complaints/" + inC, { status: "closed" }, manager.headers)).statusCode).toBe(404);
    expect((await send("PATCH", "/meal/complaints/" + inC, { status: "closed" }, viewer.headers)).statusCode).toBe(403); // sees it, may not edit (no meal.manage)
    expect((await send("PATCH", "/meal/complaints/" + inC, { status: "closed" }, admin.headers)).statusCode).toBe(200);
  });
});
