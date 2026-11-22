import { get, post, patch, listOf, unwrap, metaOf } from "@/lib/http";

const enc = encodeURIComponent;
const list = async (path, params) => {
  const res = await get(path, params);
  return { items: listOf(res), meta: metaOf(res) };
};

// ---- overview ----
export const getMealStats = async () => unwrap(await get("/meal/stats"));
export const getMealCharts = async (quarter) => unwrap(await get("/meal/charts", { quarter }));
export const getMealActivity = (params) => list("/meal/activity", params);

// ---- complaints ----
export const getComplaintStats = async () => unwrap(await get("/meal/complaints/stats"));
export const getComplaintInsights = async () => unwrap(await get("/meal/complaints/insights"));
export const listComplaints = (params) => list("/meal/complaints", params);
export const createComplaint = (body) => post("/meal/complaints", body);
export const updateComplaint = (id, body) => patch(`/meal/complaints/${enc(id)}`, body);
export const complaintsExportUrl = "/api/meal/complaints/export";

// ---- indicators ----
export const getIndicatorStats = async () => unwrap(await get("/meal/indicators/stats"));
export const getIndicatorInsights = async () => unwrap(await get("/meal/indicators/insights"));
export const listIndicators = (params) => list("/meal/indicators", params);
export const createIndicator = (body) => post("/meal/indicators", body);
export const updateIndicator = (id, body) => patch(`/meal/indicators/${enc(id)}`, body);
export function importIndicators(file) {
  const fd = new FormData();
  fd.append("file", file);
  return post("/meal/indicators/import", fd);
}
export const indicatorsExportUrl = "/api/meal/indicators/export";

// ---- MEAL reports ----
export const getMealReportStats = async () => unwrap(await get("/meal/reports/stats"));
export const getMealReportInsights = async () => unwrap(await get("/meal/reports/insights"));
export const listMealReports = (params) => list("/meal/reports", params);
export const createMealReport = (body) => post("/meal/reports", body);
export const updateMealReport = (id, body) => patch(`/meal/reports/${enc(id)}`, body);
export const listReportTemplates = async () => listOf(await get("/meal/report-templates"));
export const mealReportsExportUrl = "/api/meal/reports/export";
export const mealReportDownloadUrl = (id) => `/api/meal/reports/${enc(id)}/download`;

// ---- field data ----
export const listFieldRecords = (params) => list("/meal/field-records", params);
export function saveFieldRecord(body, files = []) {
  const fd = new FormData();
  Object.entries(body).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") fd.append(k, String(v));
  });
  files.forEach((f) => fd.append("attachments[]", f));
  return post("/meal/field-records", fd);
}
