// Multipart intake shared by every upload endpoint (documents, attachments, files, imports, field records).
// - streams to storage with a hard size cap
// - decides the MIME type from the file's magic bytes, never from the client's claim
// - all-or-nothing: if any part is rejected, everything already written is removed
import { HttpError, ValidationError } from "./errors.js";

const SIGNATURES = [
  ["application/pdf", [0x25, 0x50, 0x44, 0x46]], // %PDF
  ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ["image/jpeg", [0xff, 0xd8, 0xff]],
];

export const ALLOWED_DOCUMENT_MIMES = new Set(["application/pdf", "image/png", "image/jpeg"]);

/** Detected MIME for the known signatures, else null. */
export function sniffMime(head) {
  for (const [mime, sig] of SIGNATURES) {
    if (head.length >= sig.length && sig.every((b, i) => head[i] === b)) return mime;
  }
  return null;
}

/** Display name only (storage never uses it): no path parts, no control characters, bounded length. */
export function cleanFilename(name) {
  const base = String(name ?? "").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return (base || "file").slice(0, 200);
}

const safeClientMime = (m) => (/^[\w.+-]+\/[\w.+-]+$/.test(m ?? "") ? m.toLowerCase() : "application/octet-stream");

function addField(fields, name, value) {
  if (name.endsWith("[]")) (fields[name.slice(0, -2)] ??= []).push(value);
  else fields[name] = value;
}

/**
 * @param request   Fastify request (multipart)
 * @param opts.storage    storage driver
 * @param opts.folder     storage folder, e.g. `org-12/documents`
 * @param opts.field      field name used in 422 messages (default "file")
 * @param opts.fileFields accepted file field names (default [field, `${field}[]`])
 * @param opts.allowedMimes Set of MIME types decided by sniffing; null = accept anything (client MIME sanitised)
 * @param opts.maxBytes / opts.maxFiles / opts.minFiles
 * @returns {{ files: {name,size,mime,key}[], fields: Record<string, string|string[]> }}
 */
export async function receiveUploads(request, opts) {
  const { storage, folder, field = "file", allowedMimes = null, maxBytes, maxFiles = 10, minFiles = 1 } = opts;
  const fileFields = opts.fileFields ?? [field, `${field}[]`];
  const missing = () => new ValidationError({ [field]: ["الملف مطلوب."] });

  if (!request.isMultipart()) throw missing();

  const stored = []; // keys written so far, for rollback
  const files = [];
  const fields = {};
  try {
    for await (const part of request.parts({ limits: { fileSize: maxBytes, files: maxFiles } })) {
      if (part.type === "field") {
        addField(fields, part.fieldname, part.value);
        continue;
      }
      if (!fileFields.includes(part.fieldname)) {
        part.file.resume();
        throw new ValidationError({ [field]: ["حقل ملف غير متوقع."] });
      }
      if (!part.filename) {
        part.file.resume(); // an empty file input
        continue;
      }
      const { key, size } = await storage.put(part.file, { folder });
      stored.push(key);
      if (part.file.truncated) throw new HttpError(413);
      if (size === 0) throw new ValidationError({ [field]: [`${cleanFilename(part.filename)}: الملف فارغ.`] });

      const sniffed = sniffMime(await storage.head(key, 16));
      if (allowedMimes && !allowedMimes.has(sniffed)) {
        throw new ValidationError({ [field]: [`${cleanFilename(part.filename)}: نوع الملف غير مدعوم.`] });
      }
      files.push({ name: cleanFilename(part.filename), size, mime: sniffed ?? safeClientMime(part.mimetype), key });
    }
    if (files.length < minFiles) throw missing();
    request.server.onUploadParsed?.(request, { fields, files }); // test control plane only
  } catch (err) {
    await Promise.allSettled(stored.map((k) => storage.remove(k)));
    throw err;
  }
  return { files, fields };
}
