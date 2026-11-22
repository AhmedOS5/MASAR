// Serving stored files: Content-Disposition with an RFC 5987 UTF-8 filename (Arabic names), always as a download.

export function contentDisposition(name) {
  const clean = String(name ?? "file").replace(/[\u0000-\u001f\u007f]/g, "");
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

/** Stream a stored file. `record` needs { storage_key, name, mime, size }. */
export function sendStored(reply, storage, record) {
  reply
    .header("content-type", record.mime || "application/octet-stream")
    .header("content-disposition", contentDisposition(record.name))
    .header("x-content-type-options", "nosniff");
  if (record.size) reply.header("content-length", record.size);
  return reply.send(storage.open(record.storage_key));
}

/** Small generated downloads (CSV exports, rendered reports). */
export function sendBuffer(reply, { body, name, mime }) {
  return reply
    .header("content-type", mime)
    .header("content-disposition", contentDisposition(name))
    .header("x-content-type-options", "nosniff")
    .send(body);
}
