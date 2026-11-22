// /meal/stats, /meal/charts, /meal/activity — the MEAL home page.
import { applySearch, hasFilter, pageParams } from "../../lib/pagination.js";
import { iso } from "../../lib/time.js";
import { scopeIds, visibleProjectIds } from "../projects/access.js";
import { mealGuard } from "./guard.js";
import { progressPercent, round2 } from "./indicators-core.js";

const OPEN = ["new", "in_progress"];
const NONE = "غير محدد";

export function quarterBounds(year, quarter) {
  const startMonth = (quarter - 1) * 3;
  return {
    startDate: new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10),
    endDate: new Date(Date.UTC(year, startMonth + 3, 1)).toISOString().slice(0, 10), // exclusive
    endIso: new Date(Date.UTC(year, startMonth + 3, 1)).toISOString(),
  };
}

export default async function overviewRoutes(app) {
  const { db } = app;
  const view = { preHandler: mealGuard(app, "meal.view") };

  app.get("/meal/stats", view, async (request) => {
    const org = request.auth.organizationId;
    const ids = await visibleProjectIds(db, request.auth); // only the caller's projects
    const own = (table) => scopeIds(db(table).where({ organization_id: org }), ids, "project_id");
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const [indicators, reports, complaints, records] = await Promise.all([
      own("indicators").select("project_id", "status", "target", "achieved"),
      own("meal_reports").select("project_id", "status"),
      own("complaints").select("project_id", "status"),
      own("field_records").select("project_id", "status", "total_beneficiaries", "created_at"),
    ]);

    const late = indicators.filter((i) => i.status === "delayed").length;
    const rate = indicators.length ? Math.round((indicators.reduce((s, i) => s + progressPercent(i.target, i.achieved), 0) / indicators.length) * 10) / 10 : 0;
    const submitted = records.filter((r) => r.status === "submitted");
    const beneficiaries = submitted.reduce((s, r) => s + (Number(r.total_beneficiaries) || 0), 0);
    const newThisMonth = submitted.filter((r) => iso(r.created_at) >= monthStart).reduce((s, r) => s + (Number(r.total_beneficiaries) || 0), 0);
    const inReview = reports.filter((r) => r.status === "in_review").length;
    const projects = new Set([...indicators, ...reports, ...complaints, ...records].map((r) => r.project_id));

    return {
      data: {
        late_indicators: { value: late, ...(late ? { trend: { text: "تحتاج متابعة", direction: "down" } } : {}) },
        completion_rate: { value: rate },
        beneficiaries: { value: beneficiaries, ...(newThisMonth ? { trend: { text: `+${newThisMonth.toLocaleString("en-US")} هذا الشهر`, direction: "up" } } : {}) },
        active_projects: { value: projects.size },
        reports_in_review: { value: inReview, ...(inReview ? { trend: { text: "بانتظار الاعتماد", direction: "neutral" } } : {}) },
        complaints_in_progress: { value: complaints.filter((c) => c.status === "in_progress").length },
      },
    };
  });

  // Indicators: target vs "actual as of the end of the quarter" per sector (from the indicator_updates history).
  // Distribution: beneficiaries of the quarter's submitted field records, by region.
  app.get("/meal/charts", view, async (request) => {
    const org = request.auth.organizationId;
    const now = new Date();
    const year = now.getUTCFullYear();
    const currentQ = Math.floor(now.getUTCMonth() / 3) + 1;
    const ids = await visibleProjectIds(db, request.auth); // only the caller's projects
    const quarters = Array.from({ length: currentQ }, (_, i) => `Q${i + 1}`);
    const asked = /^Q[1-4]$/.test(String(request.query.quarter)) ? String(request.query.quarter) : null;
    const quarter = asked && quarters.includes(asked) ? asked : `Q${currentQ}`;
    const { startDate, endDate, endIso } = quarterBounds(year, Number(quarter[1]));

    const [indicators, latest, records] = await Promise.all([
      scopeIds(db("indicators").where({ organization_id: org }), ids, "project_id").where("created_at", "<", endIso).select("id", "sector", "target"),
      db("indicator_updates")
        .where({ organization_id: org })
        .whereIn("id", db("indicator_updates").where({ organization_id: org }).where("created_at", "<", endIso).groupBy("indicator_id").select(db.raw("max(id)")))
        .select("indicator_id", "value_after"),
      scopeIds(db("field_records").where({ organization_id: org, status: "submitted" }), ids, "project_id").where("activity_date", ">=", startDate).where("activity_date", "<", endDate).select("region", "total_beneficiaries"),
    ]);

    const valueOf = new Map(latest.map((u) => [u.indicator_id, Number(u.value_after)]));
    const bySector = new Map();
    for (const i of indicators) {
      const key = i.sector ?? NONE;
      const cur = bySector.get(key) ?? { sector: key, target: 0, actual: 0 };
      cur.target += Number(i.target);
      cur.actual += valueOf.get(i.id) ?? 0;
      bySector.set(key, cur);
    }

    const byRegion = new Map();
    for (const r of records) byRegion.set(r.region ?? NONE, (byRegion.get(r.region ?? NONE) ?? 0) + (Number(r.total_beneficiaries) || 0));
    const total = [...byRegion.values()].reduce((a, b) => a + b, 0);

    return {
      data: {
        quarters,
        quarter,
        indicators: [...bySector.values()].sort((a, b) => a.sector.localeCompare(b.sector, "ar")).map((s) => ({ sector: s.sector, target: round2(s.target), actual: round2(s.actual) })),
        distribution: total
          ? [...byRegion.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([label, v]) => ({ label, percent: Math.round((v / total) * 1000) / 10 }))
          : [],
        total_beneficiaries: total,
      },
    };
  });

  // Latest field records and complaints in one feed (a union, so each side is over-fetched then merged).
  app.get("/meal/activity", view, async (request) => {
    const org = request.auth.organizationId;
    const q = request.query;
    const { page, perPage } = pageParams(q);
    const need = page * perPage;
    const wantRecords = !hasFilter(q.type) || ["activity", "visit"].includes(q.type);
    const wantComplaints = !hasFilter(q.type) || q.type === "complaint";
    const ids = await visibleProjectIds(db, request.auth); // only the caller's projects

    const recordsQb = () => {
      // `activity` = all field work (visits included); `visit` narrows to visits.
      const qb = scopeIds(db("field_records as f").leftJoin("projects as pr", "pr.id", "f.project_id").where("f.organization_id", org), ids, "f.project_id");
      if (q.type === "visit") qb.where("f.activity_type", "like", "%زيارة%");
      return applySearch(qb, q.search, ["f.title", "pr.name", "f.region", "f.location", "f.activity_type"]);
    };
    const complaintsQb = () =>
      applySearch(scopeIds(db("complaints as c").leftJoin("projects as pr", "pr.id", "c.project_id").where("c.organization_id", org), ids, "c.project_id"), q.search, ["c.code", "c.type", "pr.name", "c.region"]);
    const count = async (qb) => Number((await qb.clone().count({ n: "*" }).first()).n);

    const [recTotal, cmpTotal, recRows, cmpRows] = await Promise.all([
      wantRecords ? count(recordsQb()) : 0,
      wantComplaints ? count(complaintsQb()) : 0,
      wantRecords ? recordsQb().select("f.*", "pr.name as project_name").orderByRaw("coalesce(cast(f.activity_date as text), substr(cast(f.created_at as text), 1, 10)) desc, f.id desc").limit(need) : [],
      wantComplaints ? complaintsQb().select("c.*", "pr.name as project_name").orderBy([{ column: "c.received_at", order: "desc" }, { column: "c.id", order: "desc" }]).limit(need) : [],
    ]);

    let items = [
      ...recRows.map((r) => ({
        id: r.id,
        type: /زيارة/.test(r.activity_type ?? "") ? "visit" : "activity",
        status: r.status === "submitted" ? "completed" : "documenting",
        location: [r.region, r.location].filter(Boolean).join(" — ") || null,
        project_id: r.project_id,
        project: r.project_name,
        title: r.title || r.activity_type || "سجل ميداني",
        date: r.activity_date ?? iso(r.created_at).slice(0, 10),
      })),
      ...cmpRows.map((c) => ({
        id: c.id,
        type: "complaint",
        status: OPEN.includes(c.status) ? (c.priority === "sensitive" ? "sensitive" : "in_progress") : "completed",
        location: c.region,
        project_id: c.project_id,
        project: c.project_name,
        title: `شكوى ${c.code} — ${c.type}`,
        date: c.received_at,
      })),
    ];
    items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));

    const total = recTotal + cmpTotal;
    return {
      data: items.slice((page - 1) * perPage, page * perPage),
      meta: { total, current_page: page, per_page: perPage, last_page: Math.max(1, Math.ceil(total / perPage)) },
    };
  });
}
