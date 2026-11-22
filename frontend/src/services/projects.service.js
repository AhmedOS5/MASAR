import { get, post, put, patch, listOf, unwrap, metaOf } from "@/lib/http";

const enc = encodeURIComponent;

// ---- projects (a workspace per project; the system admin creates them and builds the team) ----
export async function listProjects(params) {
  const res = await get("/projects", params);
  return { items: listOf(res), meta: metaOf(res) };
}
export const getProject = async (id) => unwrap(await get(`/projects/${enc(id)}`));
export const createProject = (body) => post("/projects", body);
export const updateProject = (id, body) => put(`/projects/${enc(id)}`, body);
/** Replaces the whole team: members = [{ user_id, project_role: "supervisor" | "member" }] */
export const setProjectMembers = (id, members) => put(`/projects/${enc(id)}/members`, { members });

// ---- the project's beneficiaries (personal data: only people with beneficiaries.* inside the team) ----
export async function listBeneficiaries(projectId, params) {
  const res = await get(`/projects/${enc(projectId)}/beneficiaries`, params);
  return { items: listOf(res), meta: metaOf(res) };
}
export const getBeneficiary = async (id) => unwrap(await get(`/beneficiaries/${enc(id)}`));
export const createBeneficiary = (projectId, body) => post(`/projects/${enc(projectId)}/beneficiaries`, body);
export const updateBeneficiary = (id, body) => put(`/beneficiaries/${enc(id)}`, body);
export function uploadBeneficiaryAttachment(id, file) {
  const fd = new FormData();
  fd.append("file", file);
  return post(`/beneficiaries/${enc(id)}/attachments`, fd);
}
export const beneficiaryAttachmentUrl = (id, attId) => `/api/beneficiaries/${enc(id)}/attachments/${enc(attId)}/download`;

// ---- the project's folders, files and reports ----
export const listProjectFolders = async (projectId) => listOf(await get("/files/folders", { project_id: projectId }));
export const createFolder = (body) => post("/files/folders", body);
export function uploadFileTo(file, { folderId } = {}) {
  const fd = new FormData();
  fd.append("file", file);
  if (folderId) fd.append("folder_id", String(folderId));
  return post("/files", fd);
}
export async function listProjectFiles(params) {
  const res = await get("/files", params);
  return { items: listOf(res), meta: metaOf(res) };
}
export async function listProjectReports(params) {
  const res = await get("/reports", params);
  return { items: listOf(res), meta: metaOf(res) };
}
export function uploadReport(file, { projectId, folderId, name, type, period } = {}) {
  const fd = new FormData();
  fd.append("file", file);
  for (const [k, v] of Object.entries({ project_id: projectId, folder_id: folderId, name, type, period })) if (v) fd.append(k, String(v));
  return post("/reports", fd);
}
/** Files a report in another folder (`null` = take it out of its folder; it stays in the project). */
export const moveReport = (id, folderId) => patch(`/reports/${enc(id)}`, { folder_id: folderId ?? "" });
