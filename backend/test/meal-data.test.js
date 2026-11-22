import { afterEach, describe, expect, it } from "vitest";
import { projectNamed, testApp, signedInAdmin, member, multipart, filesOnDisk, PDF, PNG } from "./helpers.js";
import { parseCsv } from "../src/lib/csv.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const get = (url, headers) => app.inject({ url, headers });
const send = (method, url, payload, headers) => app.inject({ method, url, payload, headers });
const upload = (url, headers, parts) => {
  const m = multipart(parts);
  return app.inject({ method: "POST", url, payload: m.payload, headers: { ...headers, ...m.headers } });
};
const otherOrg = () => signedInAdmin(app, { admin_email: "boss@other.org", organization_name: "B", organization_email: "x@other.org" });
const notes = (userId) => app.db("notifications").where({ user_id: userId }).orderBy("id");
const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();
const rowCount = async (table) => Number((await app.db(table).count({ n: "*" }).first()).n);

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

// ====================================================================== indicators
describe("indicators", () => {
  const body = (over = {}) => ({ code: "WASH-1.1", name: "عدد الأسر المستفيدة", project_id: A, sector: "المياه", target: 1000, owner_id: "", ...over });
  const create = async (user, over) => (await send("POST", "/meal/indicators", body(over), user.headers)).json().data;

  it("creates with status needs_follow, achieved 0, owner = creator", async () => {
    app = await testApp();
    const { manager } = await team();
    const res = await send("POST", "/meal/indicators", body({ target: "1000" }), manager.headers);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      code: "WASH-1.1", name: "عدد الأسر المستفيدة", project_id: A, project: "مشروع ألف", sector: "المياه", target: 1000, achieved: 0, progress: 0,
      status: "needs_follow", owner: { id: manager.userId, name: "مدير ميل" }, updated_at: expect.stringMatching(/Z$/),
    });
  });

  it("422: missing fields, non-positive/invalid target, duplicate code (any case), foreign owner", async () => {
    app = await testApp();
    const { manager } = await team();
    const b = await otherOrg();
    await create(manager);
    expect(Object.keys((await send("POST", "/meal/indicators", {}, manager.headers)).json().errors).sort()).toEqual(["code", "name", "project_id", "target"]);
    for (const [over, field] of [[{ target: 0 }, "target"], [{ target: -5 }, "target"], [{ target: "" }, "target"], [{ target: "abc" }, "target"], [{ code: "wash-1.1" }, "code"], [{ code: "  WASH-1.1 " }, "code"], [{ owner_id: b.userId, code: "N-1" }, "owner_id"]]) {
      const r = await send("POST", "/meal/indicators", body(over), manager.headers);
      expect(r.statusCode, JSON.stringify(over)).toBe(422);
      expect(r.json().errors[field], field).toBeTruthy();
    }
    expect((await send("POST", "/meal/indicators", body({ project_id: await projectNamed(app, b, "مشروع ألف") }), b.headers)).statusCode).toBe(201); // same code in another organization is fine
    expect(await rowCount("indicators")).toBe(2);
  });

  it("PATCH achieved recomputes progress and status, stamps updated_at and writes an audit row", async () => {
    app = await testApp();
    const { manager } = await team();
    const i = await create(manager, { target: 200 });
    const steps = [[20, "delayed", 10], [90, "needs_follow", 45], [150, "on_track", 75], [200, "achieved", 100], [250, "achieved", 100], [0, "needs_follow", 0]];
    for (const [achieved, status, progress] of steps) {
      const r = await send("PATCH", `/meal/indicators/${i.id}`, { achieved }, manager.headers);
      expect(r.statusCode).toBe(200);
      expect(r.json().data, `achieved=${achieved}`).toMatchObject({ achieved, status, progress });
    }
    const audit = await app.db("indicator_updates").orderBy("id");
    expect(audit.map((a) => [a.delta, a.value_after, a.source])).toEqual([[20, 20, "manual"], [70, 90, "manual"], [60, 150, "manual"], [50, 200, "manual"], [50, 250, "manual"], [-250, 0, "manual"]]);
    expect(audit.every((a) => a.created_by === manager.userId)).toBe(true);
  });

  it("PATCH can reassign the owner alone; rejects negatives, empty bodies, foreign owners; 404 across organizations", async () => {
    app = await testApp();
    const { manager, viewer } = await team();
    const b = await otherOrg();
    const i = await create(manager);
    const r = await send("PATCH", `/meal/indicators/${i.id}`, { owner_id: viewer.userId }, manager.headers);
    expect(r.json().data.owner.name).toBe("مشاهد");
    expect(await rowCount("indicator_updates")).toBe(0); // no value change => no audit row
    for (const bad of [{ achieved: -1 }, { achieved: "abc" }, {}, { owner_id: b.userId }]) {
      expect((await send("PATCH", `/meal/indicators/${i.id}`, bad, manager.headers)).statusCode, JSON.stringify(bad)).toBe(422);
    }
    expect((await send("PATCH", `/meal/indicators/${i.id}`, { achieved: 5 }, b.headers)).statusCode).toBe(404);
    expect((await send("PATCH", "/meal/indicators/999", { achieved: 5 }, manager.headers)).statusCode).toBe(404);
  });

  async function seed(admin) {
    const mk = (n, over) => ({ organization_id: admin.organizationId, code: `IND-${n}`, name: `مؤشر ${n}`, project_id: n % 2 ? A : B, sector: n % 2 ? "المياه" : "الصحة", target: 100, achieved: 0, status: "needs_follow", created_at: daysAgo(1), updated_at: daysAgo(1), ...over });
    await app.db("indicators").insert([
      mk(1, { achieved: 100, status: "achieved" }), mk(2, { achieved: 80, status: "on_track" }), mk(3, { achieved: 10, status: "delayed", updated_at: daysAgo(45) }),
      mk(4, { achieved: 20, status: "delayed", updated_at: daysAgo(60) }), mk(5, { achieved: 50, status: "needs_follow" }), mk(6, { achieved: 0, status: "needs_follow", name: "100% مؤشر_خاص" }),
    ]);
  }

  it("lists in creation order with filters (status, project, sector, search); 'all' = no filter", async () => {
    app = await testApp();
    const { admin, viewer } = await team();
    await seed(admin);
    const q = async (qs) => (await get(`/meal/indicators?per_page=50&${qs}`, viewer.headers)).json();
    const all = await q("");
    expect(all.meta.total).toBe(6);
    expect(all.data.map((i) => i.code)).toEqual(["IND-1", "IND-2", "IND-3", "IND-4", "IND-5", "IND-6"]);
    expect(all.data[1]).toMatchObject({ target: 100, achieved: 80, progress: 80, status: "on_track", owner: null });
    expect((await q("status=delayed")).data.map((i) => i.code)).toEqual(["IND-3", "IND-4"]);
    expect((await q("project_id=" + B)).meta.total).toBe(3);
    expect((await q("sector=" + encodeURIComponent("المياه"))).meta.total).toBe(3);
    expect((await q("status=all&search=")).meta.total).toBe(6);
    expect((await q("search=ind-3")).data).toHaveLength(1);
    expect((await q(`search=${encodeURIComponent("100%")}`)).meta.total).toBe(1);
    expect((await get("/meal/indicators?page=2&per_page=4", viewer.headers)).json().meta).toMatchObject({ total: 6, last_page: 2, current_page: 2 });
  });

  it("stats and insights are computed from the data", async () => {
    app = await testApp();
    const { admin, viewer } = await team();
    expect((await get("/meal/indicators/stats", viewer.headers)).json().data).toEqual({ total: 0, projects_count: 0, on_track: 0, needs_follow: 0, delayed: 0, achieved: 0 });
    expect((await get("/meal/indicators/insights", viewer.headers)).json().data).toEqual({ insights: [], updates: [] });
    await seed(admin);
    expect((await get("/meal/indicators/stats", viewer.headers)).json().data).toEqual({ total: 6, projects_count: 2, on_track: 1, needs_follow: 2, delayed: 2, achieved: 1 });

    const { insights, updates } = (await get("/meal/indicators/insights", viewer.headers)).json().data;
    expect(insights.map((i) => i.text)).toEqual(["2 مؤشر متأخر عن المسار", "أكثر قطاع متأخر: المياه", "متوسط الإنجاز العام 43%", "1 مؤشر تم تحقيقه بالكامل"]);
    expect(insights.map((i) => i.level)).toEqual(["danger", "danger", "warning", "success"]);
    expect(updates).toEqual([
      { indicator_id: expect.any(Number), code: "IND-4", text: "لم يُحدَّث منذ 60 يوماً" },
      { indicator_id: expect.any(Number), code: "IND-3", text: "لم يُحدَّث منذ 45 يوماً" },
    ]);
  });

  it("exports CSV with the same filters", async () => {
    app = await testApp();
    const { admin, viewer } = await team();
    await seed(admin);
    const res = await get("/meal/indicators/export?status=delayed", viewer.headers);
    expect(res.headers["content-type"]).toContain("text/csv");
    const rows = parseCsv(res.body);
    expect(rows[0]).toEqual(["الرمز", "الاسم", "المشروع", "القطاع", "المستهدف", "المحقق", "نسبة الإنجاز %", "الحالة", "المسؤول"]);
    expect(rows.slice(1).map((r) => [r[0], r[7]])).toEqual([["IND-3", "متأخر"], ["IND-4", "متأخر"]]);
  });

  it("is organization-scoped", async () => {
    app = await testApp();
    const { admin } = await team();
    const b = await otherOrg();
    await seed(admin);
    expect((await get("/meal/indicators", b.headers)).json().meta.total).toBe(0);
    expect((await get("/meal/indicators/stats", b.headers)).json().data.total).toBe(0);
  });

  describe("CSV import", () => {
    const importCsv = (user, content, name = "indicators.csv") => upload("/meal/indicators/import", user.headers, [{ name: "file", filename: name, type: "text/csv", content }]);

    it("imports English or Arabic headers, quoted commas, BOM and CRLF", async () => {
      app = await testApp();
      const { manager } = await team();
      const csv = "﻿code,name,project,sector,target,achieved\r\nA-1,\"عدد الأسر, المستفيدة\",مشروع ألف,المياه,500,100\r\nA-2,مؤشر ثانٍ,مشروع ألف,,200,\r\n";
      const res = await importCsv(manager, csv);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ imported: 2 });
      const list = (await get("/meal/indicators", manager.headers)).json().data;
      expect(list[0]).toMatchObject({ code: "A-1", name: "عدد الأسر, المستفيدة", target: 500, achieved: 100, status: "delayed", owner: { name: "مدير ميل" } });
      expect(list[1]).toMatchObject({ code: "A-2", sector: null, achieved: 0, status: "needs_follow" });
      expect((await app.db("indicator_updates")).map((u) => [u.value_after, u.source])).toEqual([[100, "manual"]]); // only the one with a value
      expect(filesOnDisk(app)).toHaveLength(0); // the upload is not kept

      const arabic = await importCsv(manager, "الرمز,الاسم,المشروع,المستهدف\nB-1,مؤشر,مشروع باء,50");
      expect(arabic.json()).toEqual({ imported: 1 });
    });

    it("is all-or-nothing: any bad row, duplicate or existing code imports nothing and says which line", async () => {
      app = await testApp();
      const { manager } = await team();
      await send("POST", "/meal/indicators", { code: "EXISTS", name: "n", project_id: A, target: 1 }, manager.headers);
      const p = "مشروع ألف";
      const cases = [
        [`code,name,project,target\nA-1,n,${p},10\nA-2,n,${p},-3`, /السطر 3/],
        [`code,name,project,target\nA-1,n,${p},10\nA-1,n2,${p},20`, /السطر 3.*مستخدم/],
        [`code,name,project,target\nexists,n,${p},10`, /السطر 2.*مستخدم/],
        [`code,name,project,target\n,n,${p},10`, /السطر 2/],
        [`code,name,project,target\nA-1,n,مشروع غير موجود,10`, /السطر 2.*المشروع/], // the project must exist and be one the person works in
      ];
      for (const [csv, message] of cases) {
        const r = await importCsv(manager, csv);
        expect(r.statusCode, csv).toBe(422);
        expect(r.json().message).toMatch(message);
        expect(r.json().errors.file.length).toBeGreaterThan(0);
      }
      expect(await rowCount("indicators")).toBe(1);
      expect(filesOnDisk(app)).toHaveLength(0);
    });

    it("422 for missing columns, no rows, empty/binary files, too many rows, a missing file", async () => {
      app = await testApp();
      const { manager } = await team();
      expect((await importCsv(manager, "code,name\nA,b")).json().errors.file[0]).toMatch(/project.*target|target.*project/);
      expect((await importCsv(manager, "code,name,project,target")).json().errors.file[0]).toMatch(/لا توجد صفوف/);
      expect((await importCsv(manager, "")).statusCode).toBe(422);
      expect((await importCsv(manager, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 1, 2, 3]))).statusCode).toBe(422);
      const many = ["code,name,project,target", ...Array.from({ length: 1001 }, (_, i) => `C-${i},n,مشروع ألف,1`)].join("\n");
      expect((await importCsv(manager, many)).json().errors.file[0]).toMatch(/1000/);
      expect((await send("POST", "/meal/indicators/import", {}, manager.headers)).statusCode).toBe(422);
      expect(await rowCount("indicators")).toBe(0);
    });
  });
});

// ================================================================= MEAL reports
describe("MEAL reports", () => {
  const body = (over = {}) => ({ title: "تقرير الربع الأول", type: "تقرير ربعي", project_id: A, period: "Q1 2026", template_id: "", ...over });
  const create = async (user, over) => (await send("POST", "/meal/reports", body(over), user.headers)).json().data;

  it("lists the built-in templates (and only this organization's own)", async () => {
    app = await testApp();
    const { viewer, admin } = await team();
    const b = await otherOrg();
    await app.db("report_templates").insert({ organization_id: admin.organizationId, name: "قالب خاص", type: "x" });
    const mine = (await get("/meal/report-templates", viewer.headers)).json();
    expect(mine.data.map((t) => t.name)).toEqual(["قالب الأداء الربعي", "قالب تقدم المشروع", "قالب الشكاوى والملاحظات", "قالب خاص"]);
    expect(mine.data[0]).toEqual({ id: expect.any(Number), name: "قالب الأداء الربعي", type: "تقرير ربعي", description: expect.any(String) });
    expect((await get("/meal/report-templates", b.headers)).json().data).toHaveLength(3);
  });

  it("creates a draft owned by the creator; template_id is optional but must exist", async () => {
    app = await testApp();
    const { manager } = await team();
    const t = (await get("/meal/report-templates", manager.headers)).json().data[0];
    const r = await send("POST", "/meal/reports", body({ template_id: String(t.id) }), manager.headers);
    expect(r.statusCode).toBe(201);
    expect(r.json().data).toMatchObject({ title: "تقرير الربع الأول", type: "تقرير ربعي", project_id: A, project: "مشروع ألف", period: "Q1 2026", status: "draft", owner: { name: "مدير ميل" } });
    expect((await send("POST", "/meal/reports", body({ template_id: 9999 }), manager.headers)).json().errors.template_id).toBeTruthy();
    expect(Object.keys((await send("POST", "/meal/reports", {}, manager.headers)).json().errors).sort()).toEqual(["project_id", "title", "type"]);
    expect((await create(manager, { period: "", template_id: "" })).period).toBeNull();
  });

  it("PATCH changes status (any → any), notifies the owner when someone else changes it", async () => {
    app = await testApp();
    const { admin, manager } = await team();
    const r = await create(manager);
    expect((await send("PATCH", `/meal/reports/${r.id}`, { status: "in_review" }, manager.headers)).json().data.status).toBe("in_review");
    expect(await notes(manager.userId)).toHaveLength(0); // own change: no notification

    expect((await send("PATCH", `/meal/reports/${r.id}`, { status: "needs_edit" }, admin.headers)).statusCode).toBe(200);
    expect((await notes(manager.userId))[0]).toMatchObject({ title: "تغيّرت حالة تقريرك", type: "alert" });
    await send("PATCH", `/meal/reports/${r.id}`, { status: "approved" }, admin.headers);
    await send("PATCH", `/meal/reports/${r.id}`, { status: "approved" }, admin.headers); // unchanged: nothing new
    expect(await notes(manager.userId)).toHaveLength(2);

    for (const bad of [{ status: "published" }, {}]) expect((await send("PATCH", `/meal/reports/${r.id}`, bad, manager.headers)).statusCode).toBe(422);
    expect((await send("PATCH", "/meal/reports/999", { status: "draft" }, manager.headers)).statusCode).toBe(404);
  });

  async function seed(admin) {
    const mk = (n, status, over) => ({ organization_id: admin.organizationId, title: n === 5 ? "100% تقرير_خاص" : `تقرير ${n}`, type: n % 2 ? "مالي" : "تقرير متابعة", project_id: n % 2 ? A : B, period: n % 2 ? "Q1 2026" : "Q2 2026", status, created_at: daysAgo(30 - n), updated_at: daysAgo(30 - n), ...over });
    await app.db("meal_reports").insert([mk(1, "draft", { updated_at: daysAgo(20) }), mk(2, "in_review", { updated_at: daysAgo(10) }), mk(3, "needs_edit"), mk(4, "approved"), mk(5, "approved"), mk(6, "in_review", { updated_at: daysAgo(1) })]);
  }

  it("lists (updated first) with filters; stats and insights come from the data", async () => {
    app = await testApp();
    const { admin, viewer } = await team();
    await seed(admin);
    const q = async (qs) => (await get(`/meal/reports?per_page=50&${qs}`, viewer.headers)).json();
    const all = await q("");
    expect(all.meta.total).toBe(6);
    expect(all.data[0].title).toBe("تقرير 6"); // most recently updated
    expect((await q("status=approved")).meta.total).toBe(2);
    expect((await q("project_id=" + B)).meta.total).toBe(3);
    expect((await q("type=" + encodeURIComponent("مالي"))).meta.total).toBe(3);
    expect((await q("period=" + encodeURIComponent("Q2 2026"))).meta.total).toBe(3);
    expect((await q("status=all&project_id=all&type=all&period=all&search=")).meta.total).toBe(6);
    expect((await q(`search=${encodeURIComponent("100%")}`)).meta.total).toBe(1);

    expect((await get("/meal/reports/stats", viewer.headers)).json().data).toEqual({ total: 6, draft: 1, in_review: 2, needs_edit: 1, approved: 2 });
    const { summary, actions } = (await get("/meal/reports/insights", viewer.headers)).json().data;
    expect(summary).toEqual([{ text: "إجمالي التقارير: 6", level: "info" }, { text: "2 تقرير قيد المراجعة", level: "warning" }, { text: "2 تقرير معتمد", level: "success" }]);
    expect(actions).toEqual([{ text: "1 تقرير يحتاج تعديل", level: "danger" }, { text: "1 تقرير بانتظار الاعتماد منذ أكثر من 7 أيام", level: "warning" }, { text: "1 مسودة لم تُحدَّث منذ أكثر من 14 يوماً", level: "info" }]);
    expect((await get("/meal/reports/stats", (await otherOrg()).headers)).json().data.total).toBe(0);
  });

  it("exports CSV with Arabic status labels", async () => {
    app = await testApp();
    const { admin, viewer } = await team();
    await seed(admin);
    const rows = parseCsv((await get("/meal/reports/export?status=needs_edit", viewer.headers)).body);
    expect(rows[0]).toEqual(["العنوان", "النوع", "المشروع", "الفترة", "الحالة", "المسؤول", "آخر تحديث"]);
    expect(rows[1].slice(0, 5)).toEqual(["تقرير 3", "مالي", "مشروع ألف", "Q1 2026", "بحاجة تعديل"]);
  });

  it("downloads a rendered, escaped HTML document built from the project's live data", async () => {
    app = await testApp();
    const { admin, manager } = await team();
    const P1 = await projectNamed(app, admin, "مشروع <b>ألف</b>", [{ user: manager }]);
    const P2 = await projectNamed(app, admin, "مشروع آخر");
    const r = await create(manager, { title: "<script>alert(1)</script> تقرير", project_id: P1 });
    const mkInd = (code, over) => ({ organization_id: admin.organizationId, code, name: `مؤشر ${code}`, project_id: P1, sector: "s", target: 100, achieved: 50, status: "needs_follow", ...over });
    await app.db("indicators").insert([mkInd("I-1"), mkInd("I-2", { project_id: P2 })]);
    await app.db("field_records").insert({ organization_id: admin.organizationId, project_id: P1, status: "submitted", region: "غزة", total_beneficiaries: 120 });
    await app.db("complaints").insert({ organization_id: admin.organizationId, code: "FCRM-900", type: "t", project_id: P1, status: "new", received_at: "2026-01-01" });

    const res = await get(`/meal/reports/${r.id}/download`, manager.headers);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.body).not.toContain("<script>alert(1)</script>");
    expect(res.body).not.toContain("<b>ألف</b>");
    expect(res.body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(res.body).toContain("I-1");
    expect(res.body).not.toContain("I-2"); // other project
    expect(res.body).toContain("120");
    expect(res.body).not.toContain("FCRM-900"); // complaints are aggregated by status, never listed
    expect((await get("/meal/reports/999/download", manager.headers)).statusCode).toBe(404);
    expect((await get(`/meal/reports/${r.id}/download`, (await otherOrg()).headers)).statusCode).toBe(404);
  });
});

// ================================================================ field records
describe("field records", () => {
  const indicatorFor = async (admin, over = {}) =>
    (await app.db("indicators").insert({ organization_id: admin.organizationId, code: "I-1", name: "n", project_id: await projectNamed(app, admin, "مشروع ألف"), sector: "المياه", target: 100, achieved: 0, status: "needs_follow", ...over }, ["id"]))[0].id;
  const fields = (indicatorId, over = {}) => ({ project_id: A, sector: "المياه", activity_type: "توزيع مساعدات", activity_date: "2026-03-05", title: "توزيع", description: "d", region: "غزة", location: "حي الرمال", indicator_id: String(indicatorId), achieved_value: "30", total_beneficiaries: "120", status: "submitted", ...over });
  const asParts = (obj) => Object.entries(obj).map(([name, value]) => ({ name, value }));
  const save = (user, obj, files = []) => upload("/meal/field-records", user.headers, [...asParts(obj), ...files.map(([name, type, content]) => ({ name: "attachments[]", filename: name, type, content }))]);
  const indicatorRow = (id) => app.db("indicators").where({ id }).first();

  it("a submitted record adds its value to the indicator, recomputes the status, and is audited", async () => {
    app = await testApp();
    const { admin, manager } = await team();
    const id = await indicatorFor(admin);
    const res = await save(manager, fields(id));
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      project_id: A, project: "مشروع ألف", sector: "المياه", activity_type: "توزيع مساعدات", activity_date: "2026-03-05", region: "غزة", indicator: { id, code: "I-1" },
      achieved_value: 30, total_beneficiaries: 120, status: "submitted", attachments: [], created_at: expect.stringMatching(/Z$/),
    });
    expect(await indicatorRow(id)).toMatchObject({ achieved: 30, status: "delayed" });
    await save(manager, fields(id, { achieved_value: "45" }));
    expect(await indicatorRow(id)).toMatchObject({ achieved: 75, status: "on_track" });
    const audit = await app.db("indicator_updates").orderBy("id");
    expect(audit.map((a) => [a.delta, a.value_after, a.source])).toEqual([[30, 30, "field_record"], [45, 75, "field_record"]]);
    expect(audit[0].field_record_id).toBeTruthy();
  });

  it("concurrent submissions both count (atomic increment)", async () => {
    app = await testApp();
    const { admin, manager } = await team();
    const id = await indicatorFor(admin);
    const results = await Promise.all([1, 2, 3, 4].map(() => save(manager, fields(id, { achieved_value: "10" }))));
    expect(results.every((r) => r.statusCode === 201)).toBe(true);
    expect((await indicatorRow(id)).achieved).toBe(40);
  });

  it("a draft may be nearly empty and never touches the indicator", async () => {
    app = await testApp();
    const { admin, manager } = await team();
    const id = await indicatorFor(admin);
    expect((await save(manager, { status: "draft" })).statusCode).toBe(422); // even a draft belongs to a project
    const empty = await save(manager, { status: "draft", project_id: String(A) });
    expect(empty.statusCode).toBe(201);
    expect(empty.json().data).toMatchObject({ status: "draft", project: "مشروع ألف", indicator: null, achieved_value: null });
    expect((await save(manager, fields(id, { status: "draft" }))).statusCode).toBe(201);
    expect(await indicatorRow(id)).toMatchObject({ achieved: 0, status: "needs_follow" });
    expect(await rowCount("indicator_updates")).toBe(0);
  });

  it("submitting needs the required fields, a real indicator of this organization, and valid numbers", async () => {
    app = await testApp();
    const { admin, manager } = await team();
    const b = await otherOrg();
    const foreign = await indicatorFor(b, { code: "F-1" });
    const id = await indicatorFor(admin);
    const r = await save(manager, { status: "submitted", project_id: String(A) });
    expect(r.statusCode).toBe(422);
    expect(Object.keys(r.json().errors).sort()).toEqual(["achieved_value", "activity_date", "activity_type", "indicator_id", "region", "sector"]);
    for (const [over, field] of [[{ indicator_id: String(foreign) }, "indicator_id"], [{ indicator_id: "9999" }, "indicator_id"], [{ achieved_value: "-5" }, "achieved_value"], [{ achieved_value: "abc" }, "achieved_value"], [{ total_beneficiaries: "-1" }, "total_beneficiaries"], [{ activity_date: "2026-02-31" }, "activity_date"], [{ status: "published" }, "status"]]) {
      const res = await save(manager, fields(id, over));
      expect(res.statusCode, JSON.stringify(over)).toBe(422);
      expect(res.json().errors[field], field).toBeTruthy();
    }
    expect(await rowCount("field_records")).toBe(0);
    expect(await indicatorRow(id)).toMatchObject({ achieved: 0 });
  });

  it("stores PDF/PNG evidence, lists it, and serves it back; bad files abort everything", async () => {
    app = await testApp();
    const { admin, manager, viewer } = await team();
    const id = await indicatorFor(admin);
    const ok = await save(manager, fields(id), [["صورة.png", "image/png", PNG], ["محضر.pdf", "application/pdf", PDF]]);
    expect(ok.statusCode).toBe(201);
    const rec = ok.json().data;
    expect(rec.attachments.map((a) => [a.name, a.mime])).toEqual([["صورة.png", "image/png"], ["محضر.pdf", "application/pdf"]]);
    const dl = await get(`/meal/field-records/${rec.id}/attachments/${rec.attachments[1].id}/download`, viewer.headers);
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.equals(PDF)).toBe(true);
    expect((await get(`/meal/field-records/${rec.id}/attachments/${rec.attachments[1].id}/download`, (await otherOrg()).headers)).statusCode).toBe(404);

    const before = await rowCount("field_records");
    const bad = await save(manager, fields(id), [["ok.pdf", "application/pdf", PDF], ["evil.exe", "application/octet-stream", "MZ......"]]);
    expect(bad.statusCode).toBe(422);
    expect(await rowCount("field_records")).toBe(before);
    expect(filesOnDisk(app)).toHaveLength(2); // only the first record's files remain
    expect((await indicatorRow(id)).achieved).toBe(30); // the failed submission did not count
  });

  it("413 for an attachment above 5 MB and nothing is saved", async () => {
    app = await testApp();
    const { admin, manager } = await team();
    const id = await indicatorFor(admin);
    const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
    expect((await save(manager, fields(id), [["big.pdf", "application/pdf", big]])).statusCode).toBe(413);
    expect(await rowCount("field_records")).toBe(0);
    expect(filesOnDisk(app)).toHaveLength(0);
  });

  it("also accepts a plain JSON body (no attachments)", async () => {
    app = await testApp();
    const { admin, manager } = await team();
    const id = await indicatorFor(admin);
    const res = await send("POST", "/meal/field-records", { ...fields(id), indicator_id: id, achieved_value: 100 }, manager.headers);
    expect(res.statusCode).toBe(201);
    expect(await indicatorRow(id)).toMatchObject({ achieved: 100, status: "achieved" });
  });

  it("lists newest first with pagination, indicator code and attachments; tenant-scoped", async () => {
    app = await testApp();
    const { admin, manager, viewer } = await team();
    const id = await indicatorFor(admin);
    for (let i = 1; i <= 5; i++) {
      await app.db("field_records").insert({ organization_id: admin.organizationId, title: `سجل ${i}`, status: i % 2 ? "submitted" : "draft", indicator_id: i === 5 ? id : null, project_id: i < 3 ? A : B, created_at: daysAgo(10 - i) });
    }
    const page = (await get("/meal/field-records?per_page=3", viewer.headers)).json();
    expect(page.meta).toMatchObject({ total: 5, last_page: 2 });
    expect(page.data.map((r) => r.title)).toEqual(["سجل 5", "سجل 4", "سجل 3"]);
    expect(page.data[0].indicator).toEqual({ id, code: "I-1" });
    expect((await get("/meal/field-records?status=draft&per_page=50", viewer.headers)).json().meta.total).toBe(2);
    expect((await get(`/meal/field-records?project_id=${A}&per_page=50`, viewer.headers)).json().meta.total).toBe(2);
    expect((await get("/meal/field-records", (await otherOrg()).headers)).json().meta.total).toBe(0);
    void manager;
  });
});
