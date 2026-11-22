// SQLite returns "YYYY-MM-DD HH:MM:SS" (UTC, no zone); PostgreSQL returns Date. The API always speaks ISO-8601.

export const nowIso = () => new Date().toISOString();

const SQLITE_TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

/** Normalise any DB timestamp value to an ISO-8601 UTC string (null/undefined pass through as null). */
export function iso(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  const s = String(value);
  if (SQLITE_TS.test(s)) return `${s.replace(" ", "T")}Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

/** SQLite stores booleans as 0/1. */
export const bool = (v) => v === true || v === 1 || v === "1" || v === "t" || v === "true";
