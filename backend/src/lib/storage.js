// File storage behind a small interface (local disk now; an S3 driver can implement the same methods).
// Keys are generated here (`<folder>/<uuid>`), never taken from user input.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";

const KEY_RE = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;

export function createLocalStorage(root) {
  const resolve = (key) => {
    if (typeof key !== "string" || !KEY_RE.test(key)) throw new Error("invalid storage key");
    const full = path.join(root, ...key.split("/"));
    if (!full.startsWith(root + path.sep)) throw new Error("invalid storage key");
    return full;
  };

  return {
    /** Stream `readable` to disk. Removes the partial file if the stream fails. Returns { key, size }. */
    async put(readable, { folder }) {
      const key = `${folder}/${randomUUID()}`;
      const file = resolve(key);
      await fsp.mkdir(path.dirname(file), { recursive: true });
      try {
        await pipeline(readable, fs.createWriteStream(file, { flags: "wx", mode: 0o640 }));
      } catch (err) {
        await fsp.rm(file, { force: true });
        throw err;
      }
      return { key, size: (await fsp.stat(file)).size };
    },

    async putBuffer(buffer, { folder }) {
      const key = `${folder}/${randomUUID()}`;
      const file = resolve(key);
      await fsp.mkdir(path.dirname(file), { recursive: true });
      await fsp.writeFile(file, buffer, { flag: "wx", mode: 0o640 });
      return { key, size: buffer.length };
    },

    /** First `bytes` bytes (for content sniffing). */
    async head(key, bytes = 16) {
      const fh = await fsp.open(resolve(key), "r");
      try {
        const buf = Buffer.alloc(bytes);
        const { bytesRead } = await fh.read(buf, 0, bytes, 0);
        return buf.subarray(0, bytesRead);
      } finally {
        await fh.close();
      }
    },

    open: (key) => fs.createReadStream(resolve(key)),
    exists: (key) => fsp.access(resolve(key)).then(() => true, () => false),
    remove: (key) => fsp.rm(resolve(key), { force: true }),
  };
}
