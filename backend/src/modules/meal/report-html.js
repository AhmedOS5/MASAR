// A MEAL report as one self-contained RTL HTML page, built from the project's live indicators, field records and
// complaints. Every dynamic value is escaped. (Browsers shape Arabic natively, so "print to PDF" gives a correct PDF.)
import { iso } from "../../lib/time.js";
import { progressPercent, round2 } from "./indicators-core.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => Number(n).toLocaleString("en-US");

const STATUS = { draft: "مسودة", in_review: "قيد المراجعة", needs_edit: "بحاجة تعديل", approved: "معتمد" };
const IND_STATUS = { on_track: "على المسار", needs_follow: "بحاجة متابعة", delayed: "متأخر", achieved: "محققة" };
const COMPLAINT_STATUS = { new: "جديدة", in_progress: "قيد المعالجة", resolved: "تم الحل", closed: "مغلقة" };

export async function renderReportHtml(db, organizationId, report) {
  const [org, indicators, records, complaints] = await Promise.all([
    db("organizations").where({ id: organizationId }).first("name"),
    db("indicators").where({ organization_id: organizationId, project_id: report.project_id }).orderBy("id"),
    db("field_records").where({ organization_id: organizationId, project_id: report.project_id, status: "submitted" }),
    db("complaints").where({ organization_id: organizationId, project_id: report.project_id }).select("status", "priority"),
  ]);

  const beneficiaries = records.reduce((s, r) => s + (Number(r.total_beneficiaries) || 0), 0);
  const byRegion = {};
  for (const r of records) byRegion[r.region ?? "غير محدد"] = (byRegion[r.region ?? "غير محدد"] ?? 0) + (Number(r.total_beneficiaries) || 0);
  const byStatus = {};
  for (const c of complaints) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;

  const rows = (items) => items.map((cells) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  const table = (head, items, empty) =>
    items.length
      ? `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows(items)}</tbody></table>`
      : `<p class="muted">${esc(empty)}</p>`;

  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(report.title)}</title>
<style>
body{font-family:Tahoma,Arial,sans-serif;max-width:860px;margin:32px auto;padding:0 16px;color:#0f172a;line-height:1.7}
h1{margin:0 0 4px}h2{margin:28px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px}
.meta{color:#475569;margin:0 0 16px}.muted{color:#64748b}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #cbd5e1;padding:6px 10px;text-align:right}th{background:#f1f5f9}
.kpis{display:flex;gap:12px;flex-wrap:wrap}.kpi{flex:1;min-width:150px;border:1px solid #cbd5e1;border-radius:8px;padding:10px}
.kpi b{display:block;font-size:22px}
@media print{body{margin:0}}
</style></head><body>
<h1>${esc(report.title)}</h1>
<p class="meta">${esc(org?.name)} · ${esc(report.type)} · المشروع: ${esc(report.project_name)} · الفترة: ${esc(report.period ?? "—")} · الحالة: ${esc(STATUS[report.status] ?? report.status)} · المسؤول: ${esc(report.owner_name ?? "—")}</p>
<div class="kpis">
<div class="kpi"><b>${num(indicators.length)}</b>مؤشر</div>
<div class="kpi"><b>${num(records.length)}</b>سجل ميداني مُرسل</div>
<div class="kpi"><b>${num(beneficiaries)}</b>مستفيد</div>
<div class="kpi"><b>${num(complaints.length)}</b>شكوى</div>
</div>
<h2>المؤشرات</h2>
${table(["الرمز", "المؤشر", "المستهدف", "المحقق", "الإنجاز", "الحالة"], indicators.map((i) => [i.code, i.name, num(round2(i.target)), num(round2(i.achieved)), `${progressPercent(i.target, i.achieved)}%`, IND_STATUS[i.status] ?? i.status]), "لا توجد مؤشرات لهذا المشروع.")}
<h2>المستفيدون حسب المنطقة</h2>
${table(["المنطقة", "عدد المستفيدين"], Object.entries(byRegion).map(([k, v]) => [k, num(v)]), "لا توجد سجلات ميدانية مُرسلة.")}
<h2>الشكاوى</h2>
${table(["الحالة", "العدد"], Object.entries(byStatus).map(([k, v]) => [COMPLAINT_STATUS[k] ?? k, num(v)]), "لا توجد شكاوى لهذا المشروع.")}
<p class="muted">أُنشئ هذا التقرير تلقائياً من بيانات منصة مسار بتاريخ ${esc(iso(new Date()).slice(0, 10))}.</p>
</body></html>`;
}
