import { get, post, patch, listOf, unwrap, metaOf } from "@/lib/http";

const enc = encodeURIComponent;

export async function listTasks(params) {
  const res = await get("/tasks", params);
  return { items: listOf(res), meta: metaOf(res) };
}
export const getTask = async (id) => unwrap(await get(`/tasks/${enc(id)}`));
export const createTask = (body) => post("/tasks", body);
export const updateTask = (id, body) => patch(`/tasks/${enc(id)}`, body);
export const addTaskComment = (id, body) => post(`/tasks/${enc(id)}/comments`, { body });
export function uploadTaskAttachment(id, file) {
  const fd = new FormData();
  fd.append("file", file);
  return post(`/tasks/${enc(id)}/attachments`, fd);
}
export const taskAttachmentUrl = (id, attId) =>
  `/api/tasks/${enc(id)}/attachments/${enc(attId)}/download`;
