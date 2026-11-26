import { get, post, patch, put, del, listOf, unwrap, metaOf } from "@/lib/http";

const enc = encodeURIComponent;

// ---- lookups used by every <select> (departments, projects, regions, ...) ----
export const getOptions = async () => unwrap(await get("/options")) || {};
/** Replaces one select-box list of the organization (settings.manage) -> the saved values */
export const updateOptionList = (kind, values) => put(`/options/${enc(kind)}`, { values });

// ---- dashboard overview ----
export const getDashboardSummary = async () => unwrap(await get("/dashboard/summary"));

// ---- units ----
export const listUnits = async () => listOf(await get("/units"));
export const updateUnit = (id, body) => patch(`/units/${enc(id)}`, body);

// ---- files ----
export const listFolders = async () => listOf(await get("/files/folders"));
export async function listFiles(params) {
  const res = await get("/files", params);
  return { items: listOf(res), meta: metaOf(res) };
}
export function uploadFile(file, folderId) {
  const fd = new FormData();
  fd.append("file", file);
  if (folderId) fd.append("folder_id", String(folderId));
  return post("/files", fd);
}
export const fileDownloadUrl = (id) => `/api/files/${enc(id)}/download`;
export const deleteFile = (id) => del(`/files/${enc(id)}`);
/** Deletes the folder with the files inside it (reports filed in it are kept, without a folder). */
export const deleteFolder = (id) => del(`/files/folders/${enc(id)}`);

// ---- general reports ----
export const getReportsSummary = async () => unwrap(await get("/reports/summary"));
export async function listReports(params) {
  const res = await get("/reports", params);
  return { items: listOf(res), meta: metaOf(res) };
}
export const reportDownloadUrl = (id) => `/api/reports/${enc(id)}/download`;
export const deleteReport = (id) => del(`/reports/${enc(id)}`);

// ---- notifications ----
export async function listNotifications(params) {
  const res = await get("/notifications", params);
  return { items: listOf(res), meta: metaOf(res) };
}
export const markNotificationRead = (id) => patch(`/notifications/${enc(id)}/read`, {});
export const markAllNotificationsRead = () => post("/notifications/read-all", {});
