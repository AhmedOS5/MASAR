import { afterEach, describe, expect, it } from "vitest";
import { testApp, testDb, post, login, bearer, multipart, registrationBody } from "./helpers.js";
import { seedDemo, wipeData } from "../src/demo/seed.js";
import { createLocalStorage } from "../src/lib/storage.js";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const get = (url, headers) => app.inject({ url, headers });
const ctl = (method, path, payload) => app.inject({ method, url: `/__control/${path}`, payload });
const loginAs = async (email) => bearer((await login(app, email)).json().token);

describe("demo seed", () => {
  it("creates the mock-compatible fixture, and every dashboard endpoint answers for the demo admin", async () => {
    app = await testApp({ env: { ENABLE_TEST_CONTROLS: "true" } });
    const h = await loginAs("admin@org.org");
    const me = (await get("/auth/me", h)).json();
    expect(me).toMatchObject({ user: { name: "ليلى المحمود", role: "مديرة النظام", onboarding_status: "approved" }, organization: { name: "منظمة النور", email: "info@alnoor.org", phone: "+970 59 111 2222" } });

    const list = async (url) => (await get(url, h)).json();
    const requests = await list("/requests?per_page=100");
    expect(requests.meta.total).toBe(23);
    expect(requests.data.at(-1)).toMatchObject({ id: 1, code: "REQ-001", title: "طلب اختبار رقم 1", status: "pending", type: "لوجستيات" });
    expect(requests.meta.status_counts).toMatchObject({ pending: 4, approved: 4, in_progress: 4, completed: 4, rejected: 4, draft: 3 });
    const tasks = await list("/tasks?per_page=100");
    expect(tasks.meta.total).toBe(12);
    expect((await list("/tasks?status=done")).meta.total).toBe(3);
    expect((await list("/tasks/1")).data).toMatchObject({ code: "TSK-001", request: { code: "REQ-001" }, assignee: { name: "جلال العمر" } });
    expect((await list("/meal/complaints")).meta.total).toBe(14);
    expect((await list("/meal/indicators")).data[0]).toMatchObject({ code: "IND-1.1", target: 100, achieved: 50, progress: 50 });
    expect((await list("/meal/reports/stats")).data).toEqual({ total: 5, draft: 1, in_review: 1, needs_edit: 1, approved: 2 });
    expect((await list("/meal/field-records")).meta.total).toBe(0);
    expect((await list("/files")).data.map((f) => f.name).sort()).toEqual(["تقرير.pdf", "جدول.xlsx"]);
    expect((await list("/employees")).data.map((e) => e.name)).toEqual(["ليلى المحمود", "جلال العمر", "منى سالم", "هالة", "سلمى", "داليا"]);
    expect((await list("/roles")).data.map((r) => r.title)).toEqual(["مديرة النظام", "باحث ميداني", "مدير عمليات", "مسؤول المتابعة والتقييم"]);
    expect((await list("/notifications")).meta).toMatchObject({ total: 3, unread_count: 2 });
    expect((await list("/units")).data.map((u) => [u.id, u.status])).toEqual([[1, "active"], [2, "inactive"], [3, "in_development"]]);
    expect((await list("/options")).data).toMatchObject({ projects: ["مشروع ألف", "مشروع باء"], periods: ["Q1 2026", "Q2 2026"], departments: ["العمليات", "المالية", "الموارد البشرية"] });
    expect((await list("/reports/summary")).data.total_reports).toBe(1);

    for (const url of ["/dashboard/summary", "/meal/stats", "/meal/charts", "/meal/activity", "/meal/complaints/insights", "/meal/indicators/insights", "/meal/reports/insights", "/meal/report-templates", "/reports", "/files/folders", "/permissions"]) {
      expect((await get(url, h)).statusCode, url).toBe(200);
    }
  });

  it("stored files and the report document are real and downloadable", async () => {
    app = await testApp({ env: { ENABLE_TEST_CONTROLS: "true" } });
    const h = await loginAs("admin@org.org");
    expect((await get("/files/1/download", h)).body).toBe("%PDF-mock-1");
    expect((await get("/reports/1/download", h)).body).toBe("%PDF-mock-report");
  });

  it("indicator history lets the quarterly chart show the seeded values", async () => {
    app = await testApp({ env: { ENABLE_TEST_CONTROLS: "true" } });
    const h = await loginAs("admin@org.org");
    const { indicators } = (await get("/meal/charts", h)).json().data;
    expect(indicators).toEqual([{ sector: "الصحة", target: 1200, actual: 600 }, { sector: "المياه", target: 900, actual: 450 }]);
  });

  it("the other demo accounts land in their onboarding states; the researcher has tasks.view only; ops can review", async () => {
    app = await testApp({ env: { ENABLE_TEST_CONTROLS: "true" } });
    expect((await login(app, "pending@org.org")).json().user.onboarding_status).toBe("pending_approval");
    expect((await login(app, "new@org.org")).json().user.onboarding_status).toBe("incomplete");
    const jalal = await loginAs("jalal@org.org");
    expect((await get("/tasks", jalal)).statusCode).toBe(200);
    expect((await get("/requests", jalal)).statusCode).toBe(403);
    const ops = await loginAs("ops@masar.io");
    const orgs = (await get("/platform/organizations", ops)).json();
    expect(orgs.data.map((o) => [o.name, o.status]).sort()).toEqual([["مؤسسة جديدة", "incomplete"], ["مؤسسة قيد المراجعة", "pending_approval"], ["منظمة النور", "approved"]].sort());
    expect((await login(app, "hala@org.org")).statusCode).toBe(401); // MEAL staff are directory entries without a login
  });

  it("is idempotent, and wipeData restarts ids so the fixture is reproducible", async () => {
    const db = await testDb();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "masar-seed-"));
    try {
      const storage = createLocalStorage(dir);
      expect(await seedDemo(db, { storage, scryptLogN: 10 })).toMatchObject({ organizationId: 1 });
      expect(await seedDemo(db, { storage, scryptLogN: 10 })).toEqual({ skipped: true });
      expect(Number((await db("requests").count({ n: "*" }).first()).n)).toBe(23);

      await db("requests").insert({ organization_id: 1, project_id: 1, code: "REQ-999", title: "extra" });
      await wipeData(db, { uploadDir: dir });
      expect(Number((await db("users").count({ n: "*" }).first()).n)).toBe(0);
      expect(Number((await db("units").count({ n: "*" }).first()).n)).toBe(3); // reference data survives
      expect(Number((await db("report_templates").count({ n: "*" }).first()).n)).toBe(3);
      await seedDemo(db, { storage, scryptLogN: 10 });
      expect((await db("requests").orderBy("id").first()).id).toBe(1);
      expect((await db("users").where({ email: "admin@org.org" }).first()).id).toBe(1);
    } finally {
      await db.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("test control plane", () => {
  it("does not exist unless ENABLE_TEST_CONTROLS is on", async () => {
    app = await testApp();
    expect((await ctl("GET", "state")).statusCode).toBe(404);
  });

  it("reset restores the fixture (data, files, ids), the log and the failure rules", async () => {
    app = await testApp({ env: { ENABLE_TEST_CONTROLS: "true" } });
    const h = await loginAs("admin@org.org");
    await post(app, "/requests", { title: "extra", type: "t", project_id: 1 }, h);
    await ctl("POST", "fail", { method: "GET", path: "/tasks", status: 500, times: 5 });
    expect((await get("/tasks", h)).statusCode).toBe(500);

    expect((await ctl("POST", "reset")).json()).toEqual({ ok: true });
    expect((await ctl("GET", "log")).json().log).toEqual([]);
    const h2 = await loginAs("admin@org.org");
    expect((await get("/tasks", h2)).statusCode).toBe(200); // failure rule gone
    const { meta } = (await get("/requests?per_page=1", h2)).json();
    expect(meta.total).toBe(23);
    expect((await get("/requests/24", h2)).statusCode).toBe(404);
  });

  it("fail injects a status/message N times on matching requests, then recovers; prefix matching works", async () => {
    app = await testApp({ env: { ENABLE_TEST_CONTROLS: "true" } });
    const h = await loginAs("admin@org.org");
    await ctl("POST", "fail", { method: "GET", path: "/requests", status: 503, message: "خطأ تجريبي", times: 2 });
    for (let i = 0; i < 2; i++) {
      const r = await get("/requests", h);
      expect(r.statusCode).toBe(503);
      expect(r.json()).toEqual({ message: "خطأ تجريبي" });
    }
    expect((await get("/requests", h)).statusCode).toBe(200);
    await ctl("POST", "fail", { prefix: "/meal/", status: 403, message: "x" });
    expect((await get("/meal/stats", h)).statusCode).toBe(403);
    expect((await get("/meal/stats", h)).statusCode).toBe(200); // default times = 1
    await ctl("POST", "fail", { method: "POST", path: "/requests/1/approve", status: 403, message: "ليست لديك صلاحية" });
    expect((await post(app, "/requests/1/approve", {}, h)).json().message).toBe("ليست لديك صلاحية");
  });

  it("log records requests with auth header and body — JSON and multipart (fields + file names) — under /api too", async () => {
    app = await testApp({ env: { ENABLE_TEST_CONTROLS: "true" } });
    const h = await loginAs("admin@org.org");
    await ctl("POST", "reset");
    const h2 = await loginAs("admin@org.org");
    await post(app, "/api/requests", { title: "طلب", type: "t" }, h2);
    const m = multipart([{ name: "project_id", value: "2" }, { name: "indicator_id", value: "2" }, { name: "achieved_value", value: "40" }, { name: "status", value: "submitted" }, { name: "sector", value: "المياه" }, { name: "activity_type", value: "x" }, { name: "activity_date", value: "2026-05-05" }, { name: "region", value: "غزة" }, { name: "attachments[]", filename: "proof.pdf", type: "application/pdf", content: Buffer.concat([Buffer.from("%PDF-x"), Buffer.alloc(20)]) }]);
    expect((await app.inject({ method: "POST", url: "/meal/field-records", payload: m.payload, headers: { ...h2, ...m.headers } })).statusCode).toBe(201);
    void h;

    const { log } = (await ctl("GET", "log")).json();
    const created = log.find((l) => l.method === "POST" && l.path === "/requests");
    expect(created).toMatchObject({ auth: true, body: { title: "طلب", type: "t" } });
    expect(created.authorization).toMatch(/^Bearer mt_/);
    const rec = log.find((l) => l.path === "/meal/field-records");
    expect(rec.body).toMatchObject({ project_id: "2", indicator_id: "2", achieved_value: "40", status: "submitted" });
    expect(rec.body.__files).toEqual(["proof.pdf"]);
    expect(log.some((l) => l.path.startsWith("/__control"))).toBe(false);
  });

  it("registrations/onboarding views, approve, state and mail support the new-organization journey", async () => {
    app = await testApp({ env: { ENABLE_TEST_CONTROLS: "true" } });
    const body = registrationBody({ admin_email: "owner@journey.org", organization_name: "مؤسسة الرحلة" });
    expect((await post(app, "/register-organization", body)).statusCode).toBe(201);

    expect((await ctl("GET", "log")).json().registrations.at(-1)).toEqual(body);
    const mail = (await ctl("GET", "mail")).json().mail.at(-1);
    expect(mail.to).toBe("owner@journey.org");
    // the control plane exposes the outbox, so a test can read the 6-digit code exactly as a user would from the e-mail
    const code = /(?<!\d)\d{6}(?!\d)/.exec(mail.text)?.[0];
    expect(code).toMatch(/^[0-9]{6}$/);
    const verify = await post(app, "/auth/verify-email", { email: "owner@journey.org", code });
    expect(verify.json().verified).toBe(true);

    const state = (await ctl("GET", "state")).json();
    expect(state.verified).toContain("owner@journey.org");
    expect(state.users["owner@journey.org"]).toBe("incomplete");
    expect(state.users["pending@org.org"]).toBe("pending_approval");
    expect(state.users["ops@masar.io"]).toBe("approved");

    await ctl("POST", "approve", { email: "pending@org.org" });
    expect((await ctl("GET", "state")).json().users["pending@org.org"]).toBe("approved");
    await ctl("POST", "approve", { email: "ghost@x.org" }); // unknown e-mail: harmless
    await ctl("POST", "approve", {});
  });
});
