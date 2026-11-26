import { get, post, del, listOf, unwrap, metaOf } from "@/lib/http";

const enc = encodeURIComponent;

export async function listRequests(params) {
  const res = await get("/requests", params);
  return { items: listOf(res), meta: metaOf(res) };
}
export const getRequest = async (id) => unwrap(await get(`/requests/${enc(id)}`));
export const createRequest = (body) => post("/requests", body);
export const approveRequest = (id) => post(`/requests/${enc(id)}/approve`, {});
export const rejectRequest = (id, reason) => post(`/requests/${enc(id)}/reject`, { reason });
export const createTaskFromRequest = (id) => post(`/requests/${enc(id)}/tasks`, {});
export const addRequestComment = (id, body) => post(`/requests/${enc(id)}/comments`, { body });
export function uploadRequestAttachment(id, file) {
  const fd = new FormData();
  fd.append("file", file);
  return post(`/requests/${enc(id)}/attachments`, fd);
}
export const requestAttachmentUrl = (id, attId) =>
  `/api/requests/${enc(id)}/attachments/${enc(attId)}/download`;
export const deleteRequestAttachment = (id, attId) => del(`/requests/${enc(id)}/attachments/${enc(attId)}`);
