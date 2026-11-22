import { afterEach, describe, expect, it } from "vitest";
import { testApp, signedInAdmin, member, projectNamed } from "./helpers.js";
import { quarterBounds } from "../src/modules/meal/overview.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const get = (url, headers) => app.inject({ url, headers });
const otherOrg = () => signedInAdmin(app, { admin_email: "boss@other.org", organization_name: "B", organization_email: "x@other.org" });
const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();

// every MEAL row belongs to a project; the viewer is on the team of each one created through P()
let viewerOnTeam;
const P = (admin, name = "مشروع ألف") => projectNamed(app, admin, name, [{ user: viewerOnTeam }]);
async function setup() {
  const admin = await signedInAdmin(app);
  const viewer = await member(app, admin, { email: "view@org.org", permissions: ["meal.view"] });
  viewerOnTeam = viewer;
  return { admin, viewer };
}

describe("quarterBounds", () => {
  it("returns inclusive start / exclusive end dates", () => {
    expect(quarterBounds(2026, 1)).toMatchObject({ startDate: "2026-01-01", endDate: "2026-04-01" });
    expect(quarterBounds(2026, 4)).toMatchObject({ startDate: "2026-10-01", endDate: "2027-01-01" });
  });
});

describe("GET /meal/stats", () => {
  it("is all zeros — and has no trend entries — for an organization with no MEAL data", async () => {
    app = await testApp();
    const { viewer } = await setup();
    const { data } = (await get("/meal/stats", viewer.headers)).json();
    expect(data).toEqual({
      late_indicators: { value: 0 }, completion_rate: { value: 0 }, beneficiaries: { value: 0 },
      active_projects: { value: 0 }, reports_in_review: { value: 0 }, complaints_in_progress: { value: 0 },
    });
  });

  it("derives every figure from the data", async () => {
    app = await testApp();
    const { admin, viewer } = await setup();
    const org = admin.organizationId;
    const [alef, baa, jim, dal] = [await P(admin, "مشروع ألف"), await P(admin, "مشروع باء"), await P(admin, "مشروع جيم"), await P(admin, "مشروع دال")];
    const ind = (n, p, t, a, status) => ({ organization_id: org, code: `I-${n}`, name: "n", project_id: p, target: t, achieved: a, status });
    await app.db("indicators").insert([ind(1, alef, 100, 100, "achieved"), ind(2, alef, 100, 50, "needs_follow"), ind(3, baa, 200, 20, "delayed"), ind(4, baa, 100, 500, "achieved")]);
    await app.db("meal_reports").insert([{ organization_id: org, title: "a", status: "in_review", project_id: jim }, { organization_id: org, title: "b", status: "approved", project_id: alef }, { organization_id: org, title: "c", status: "in_review", project_id: alef }]);
    await app.db("complaints").insert([
      { organization_id: org, code: "FCRM-900", type: "t", status: "in_progress", received_at: "2026-01-01", project_id: dal },
      { organization_id: org, code: "FCRM-901", type: "t", status: "new", received_at: "2026-01-01", project_id: alef },
    ]);
    await app.db("field_records").insert([
      { organization_id: org, status: "submitted", total_beneficiaries: 100, created_at: new Date().toISOString(), project_id: alef },
      { organization_id: org, status: "submitted", total_beneficiaries: 50, created_at: daysAgo(90), project_id: alef },
      { organization_id: org, status: "draft", total_beneficiaries: 999, created_at: new Date().toISOString(), project_id: alef }, // drafts do not count
    ]);

    const { data } = (await get("/meal/stats", viewer.headers)).json();
    expect(data.late_indicators).toEqual({ value: 1, trend: { text: "تحتاج متابعة", direction: "down" } });
    expect(data.completion_rate).toEqual({ value: 65 }); // (100 + 50 + 10 + 100) / 4: each indicator's progress is capped at 100%
    expect(data.beneficiaries.value).toBe(150);
    expect(data.beneficiaries.trend).toEqual({ text: "+100 هذا الشهر", direction: "up" });
    expect(data.active_projects).toEqual({ value: 4 }); // ألف, باء, جيم, دال across all tables
    expect(data.reports_in_review).toEqual({ value: 2, trend: { text: "بانتظار الاعتماد", direction: "neutral" } });
    expect(data.complaints_in_progress).toEqual({ value: 1 });
  });

  it("never mixes organizations", async () => {
    app = await testApp();
    const { admin } = await setup();
    const b = await otherOrg();
    await app.db("indicators").insert({ organization_id: admin.organizationId, code: "I-1", name: "n", project_id: await P(admin), target: 1, achieved: 0, status: "delayed" });
    expect((await get("/meal/stats", b.headers)).json().data.late_indicators.value).toBe(0);
  });
});

describe("GET /meal/charts", () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const currentQ = Math.floor(now.getUTCMonth() / 3) + 1;
  const currentQuarter = `Q${currentQ}`;
  const q1Date = `${year}-02-15`;
  const curStart = quarterBounds(year, currentQ).startDate;

  async function seed(admin) {
    const org = admin.organizationId;
    const project_id = await P(admin);
    const [{ id: water }] = await app.db("indicators").insert({ organization_id: org, project_id, code: "W-1", name: "n", sector: "المياه", target: 100, achieved: 80, status: "on_track", created_at: `${year}-01-02T00:00:00.000Z` }, ["id"]);
    const [{ id: water2 }] = await app.db("indicators").insert({ organization_id: org, project_id, code: "W-2", name: "n", sector: "المياه", target: 50, achieved: 0, status: "needs_follow", created_at: `${year}-01-02T00:00:00.000Z` }, ["id"]);
    const [{ id: health }] = await app.db("indicators").insert({ organization_id: org, project_id, code: "H-1", name: "n", sector: "الصحة", target: 200, achieved: 20, status: "delayed", created_at: new Date().toISOString() }, ["id"]);
    const upd = (indicator_id, value_after, created_at) => ({ organization_id: org, indicator_id, delta: value_after, value_after, source: "manual", created_at });
    await app.db("indicator_updates").insert([upd(water, 30, `${year}-02-15T10:00:00.000Z`), upd(water, 80, new Date().toISOString()), upd(health, 20, new Date().toISOString())]);
    void water2;
    const rec = (region, beneficiaries, activity_date, status = "submitted") => ({ organization_id: org, project_id, status, region, total_beneficiaries: beneficiaries, activity_date });
    await app.db("field_records").insert([rec("غزة", 300, curStart), rec("الضفة", 100, curStart), rec("غزة", 999, curStart, "draft"), rec("القدس", 40, q1Date)]);
  }

  it("defaults to the current quarter and lists the quarters of this year up to it", async () => {
    app = await testApp();
    const { admin, viewer } = await setup();
    await seed(admin);
    const { data } = (await get("/meal/charts", viewer.headers)).json();
    expect(data.quarters).toEqual(Array.from({ length: currentQ }, (_, i) => `Q${i + 1}`));
    expect(data.quarter).toBe(currentQuarter);
    // "actual" = value as of the end of the quarter, summed per sector; target = sum of the sector's targets
    expect(data.indicators).toEqual([{ sector: "الصحة", target: 200, actual: 20 }, { sector: "المياه", target: 150, actual: 80 }]);
    if (currentQ > 1) {
      expect(data.distribution).toEqual([{ label: "غزة", percent: 75 }, { label: "الضفة", percent: 25 }]);
      expect(data.total_beneficiaries).toBe(400);
    }
  });

  it.runIf(currentQ > 1)("shows Q1 as it was at the end of Q1 (history, not today's values)", async () => {
    app = await testApp();
    const { admin, viewer } = await setup();
    await seed(admin);
    const { data } = (await get("/meal/charts?quarter=Q1", viewer.headers)).json();
    expect(data.quarter).toBe("Q1");
    expect(data.indicators).toEqual([{ sector: "المياه", target: 150, actual: 30 }]); // the health indicator did not exist yet
    expect(data.distribution).toEqual([{ label: "القدس", percent: 100 }]);
    expect(data.total_beneficiaries).toBe(40);
  });

  it("falls back to the current quarter for an invalid or future quarter", async () => {
    app = await testApp();
    const { viewer } = await setup();
    for (const q of ["Q9", "x", "q1; drop", ""]) expect((await get(`/meal/charts?quarter=${encodeURIComponent(q)}`, viewer.headers)).json().data.quarter, q).toBe(q.toUpperCase() === "Q1" && currentQ >= 1 ? "Q1" : currentQuarter);
    if (currentQ < 4) expect((await get("/meal/charts?quarter=Q4", viewer.headers)).json().data.quarter).toBe(currentQuarter);
  });

  it("is empty (not an error) without data, and tenant-scoped", async () => {
    app = await testApp();
    const { admin, viewer } = await setup();
    const empty = (await get("/meal/charts", viewer.headers)).json().data;
    expect(empty).toMatchObject({ indicators: [], distribution: [], total_beneficiaries: 0 });
    await seed(admin);
    const b = await otherOrg();
    expect((await get("/meal/charts", b.headers)).json().data.indicators).toEqual([]);
  });
});

describe("GET /meal/activity", () => {
  async function seed(admin) {
    const org = admin.organizationId;
    const [alef, baa] = [await P(admin, "مشروع ألف"), await P(admin, "مشروع باء")];
    await app.db("field_records").insert([
      { organization_id: org, status: "submitted", activity_type: "توزيع مساعدات", title: "توزيع سلال غذائية", project_id: alef, region: "غزة", location: "الرمال", activity_date: "2026-03-10", created_at: daysAgo(5) },
      { organization_id: org, status: "draft", activity_type: "زيارة ميدانية", title: null, project_id: baa, region: "الضفة", activity_date: "2026-03-12", created_at: daysAgo(4) },
      { organization_id: org, status: "submitted", activity_type: "جلسة تدريب", title: "100% تدريب_خاص", project_id: alef, region: "القدس", activity_date: null, created_at: "2026-03-20T10:00:00.000Z" },
    ]);
    await app.db("complaints").insert([
      { organization_id: org, code: "FCRM-900", type: "تأخير", status: "new", priority: "sensitive", received_at: "2026-03-15", project_id: alef, region: "غزة" },
      { organization_id: org, code: "FCRM-901", type: "نقص", status: "in_progress", priority: "low", received_at: "2026-03-05", project_id: baa, region: "الضفة" },
      { organization_id: org, code: "FCRM-902", type: "سلوك", status: "resolved", priority: "sensitive", received_at: "2026-03-01", project_id: baa, region: "الضفة" },
    ]);
  }

  it("merges field records and complaints newest first with mapped types, statuses and titles", async () => {
    app = await testApp();
    const { admin, viewer } = await setup();
    await seed(admin);
    const { data, meta } = (await get("/meal/activity?type=all&search=&per_page=10", viewer.headers)).json();
    expect(meta).toMatchObject({ total: 6, current_page: 1, last_page: 1, per_page: 10 });
    expect(data.map((r) => [r.type, r.title, r.date, r.status])).toEqual([
      ["activity", "100% تدريب_خاص", "2026-03-20", "completed"],
      ["complaint", "شكوى FCRM-900 — تأخير", "2026-03-15", "sensitive"], // sensitive + still open
      ["visit", "زيارة ميدانية", "2026-03-12", "documenting"], // draft record, title falls back to the activity type
      ["activity", "توزيع سلال غذائية", "2026-03-10", "completed"],
      ["complaint", "شكوى FCRM-901 — نقص", "2026-03-05", "in_progress"],
      ["complaint", "شكوى FCRM-902 — سلوك", "2026-03-01", "completed"], // resolved, even though sensitive
    ]);
    expect(data[3]).toMatchObject({ location: "غزة — الرمال", project: "مشروع ألف" });
    expect(data[1].location).toBe("غزة");
  });

  it("filters by type (activity = all field work, visit, complaint) and searches across both", async () => {
    app = await testApp();
    const { admin, viewer } = await setup();
    await seed(admin);
    const q = async (qs) => (await get(`/meal/activity?per_page=50&${qs}`, viewer.headers)).json();
    expect((await q("type=complaint")).data.every((r) => r.type === "complaint")).toBe(true);
    expect((await q("type=complaint")).meta.total).toBe(3);
    expect((await q("type=activity")).meta.total).toBe(3);
    expect((await q("type=visit")).data.map((r) => r.type)).toEqual(["visit"]);
    expect((await q("search=" + encodeURIComponent("الضفة"))).meta.total).toBe(3);
    expect((await q("type=complaint&search=FCRM-90")).meta.total).toBe(3);
    expect((await q(`search=${encodeURIComponent("100%")}`)).data).toHaveLength(1);
    expect((await q("type=all&search=nothing-matches")).data).toEqual([]);
  });

  it("paginates the merged feed correctly across both sources", async () => {
    app = await testApp();
    const { admin, viewer } = await setup();
    await seed(admin);
    const page = async (p) => (await get(`/meal/activity?per_page=4&page=${p}`, viewer.headers)).json();
    const [p1, p2] = [await page(1), await page(2)];
    expect(p1.meta).toMatchObject({ total: 6, last_page: 2 });
    expect(p1.data).toHaveLength(4);
    expect(p2.data).toHaveLength(2);
    expect([...p1.data, ...p2.data].map((r) => `${r.type}-${r.id}`)).toHaveLength(new Set([...p1.data, ...p2.data].map((r) => `${r.type}-${r.id}`)).size);
    expect((await get("/meal/activity?per_page=2", viewer.headers)).json().data).toHaveLength(2);
  });

  it("is tenant-scoped", async () => {
    app = await testApp();
    const { admin } = await setup();
    const b = await otherOrg();
    await seed(admin);
    expect((await get("/meal/activity", b.headers)).json()).toMatchObject({ data: [], meta: { total: 0 } });
  });
});
