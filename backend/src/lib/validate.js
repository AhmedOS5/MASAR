// Zod -> Laravel-style 422 mapping, Arabic default messages, and reusable field schemas.
import { z } from "zod";
import { ValidationError, notFound } from "./errors.js";

// ------------------------------------------------------------ Arabic messages
z.config({
  customError(issue) {
    switch (issue.code) {
      case "invalid_type":
        return issue.input === undefined || issue.input === null ? "الحقل مطلوب." : "قيمة غير صالحة.";
      case "too_small":
        if (issue.origin === "string") {
          return issue.minimum === 1 ? "الحقل مطلوب." : `يجب ألا يقل طول الحقل عن ${issue.minimum} أحرف.`;
        }
        if (issue.origin === "array") return issue.minimum === 1 ? "اختر عنصراً واحداً على الأقل." : `اختر ${issue.minimum} عناصر على الأقل.`;
        return `يجب ألا تقل القيمة عن ${issue.minimum}.`;
      case "too_big":
        if (issue.origin === "string") return `يجب ألا يزيد طول الحقل عن ${issue.maximum} حرفاً.`;
        return `يجب ألا تزيد القيمة عن ${issue.maximum}.`;
      case "invalid_format":
        return issue.format === "email" ? "بريد إلكتروني غير صالح." : "الصيغة غير صالحة.";
      case "invalid_value":
        return "القيمة المختارة غير مسموحة.";
      default:
        return undefined; // zod's default
    }
  },
});

/** `{ "address.city": ["msg"] }` from a ZodError (array indexes become `items.0`). */
export function zodToErrors(error) {
  const out = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Parse `data` with `schema`; throws ValidationError (422) with per-field messages. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) throw new ValidationError(zodToErrors(result.error));
  return result.data;
}

// ------------------------------------------------------------ reusable schemas
// HTML forms and the frontend send "" for "nothing chosen"; treat it as absent.
const blankToUndefined = (v) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const trim = (v) => (typeof v === "string" ? v.trim() : v);

/** Required, trimmed, non-empty string. */
export const text = (max = 255) => z.preprocess(trim, z.string().min(1).max(max));
/** Optional string; "" and null become undefined. */
export const optText = (max = 255) =>
  z.preprocess((v) => (v === null ? undefined : blankToUndefined(trim(v))), z.string().max(max).optional());
export const email = () => z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.email().max(255));
/** Positive integer id, accepts "12" or 12. */
export const id = () => z.coerce.number().int().positive();
/** Required id: missing, null and "" fail with "الحقل مطلوب."; anything that is not a positive integer with "قيمة غير صالحة." */
export const requiredId = () =>
  z.any().transform((v, ctx) => {
    const x = v === null ? undefined : blankToUndefined(v);
    if (x === undefined) {
      ctx.issues.push({ code: "custom", message: "الحقل مطلوب.", input: v });
      return z.NEVER;
    }
    const n = typeof x === "number" || typeof x === "string" ? Number(x) : NaN;
    if (!Number.isInteger(n) || n < 1) {
      ctx.issues.push({ code: "custom", message: "قيمة غير صالحة.", input: v });
      return z.NEVER;
    }
    return n;
  });
export const optId = () =>
  z.preprocess((v) => (v === null ? undefined : blankToUndefined(v)), z.coerce.number().int().positive().optional());
/** Non-negative number (money, counts); accepts numeric strings, "" => undefined. */
export const optNumber = ({ min = 0, max = Number.MAX_SAFE_INTEGER } = {}) =>
  z.preprocess((v) => (v === null ? undefined : blankToUndefined(v)), z.coerce.number().min(min).max(max).optional());
/** Optional integer within bounds; "" => undefined. */
export const optInt = ({ min = 0, max = 2_000_000_000 } = {}) =>
  z.preprocess((v) => (v === null ? undefined : blankToUndefined(v)), z.coerce.number().int().min(min).max(max).optional());
/** Route param /:id -> positive integer, otherwise 404 (an id that cannot exist is simply not found). */
export function paramId(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw notFound();
  return n;
}
/** True for a real calendar date written YYYY-MM-DD (rejects 2026-02-31). */
export function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const dateText = z.string().refine(isRealDate, "تاريخ غير صالح.");
const toDateText = (v) => (typeof v === "string" ? blankToUndefined(v.trim())?.slice(0, 10) : v);
/** YYYY-MM-DD (also accepts a full ISO timestamp and keeps the date part). Optional. */
export const dateOnly = () => z.preprocess(toDateText, dateText.optional());
/** Like dateOnly() but "" / null mean "clear" and arrive as null (for PATCH bodies). */
export const nullableDate = () => z.preprocess((v) => (v === null ? null : (toDateText(v) ?? null)), dateText.nullable());
/** Optional text where "" / null mean "clear" (null) — for PATCH bodies. */
export const nullableText = (max = 255) =>
  z.preprocess((v) => (v === null || (typeof v === "string" && v.trim() === "") ? null : trim(v)), z.string().max(max).nullable());
/** Optional id where "" / null mean "none" (null) — for PATCH bodies. */
export const nullableId = () =>
  z.preprocess((v) => (v === null || v === "" ? null : v), z.coerce.number().int().positive().nullable());
/** Truthy form values: true, "true", "1", 1, "on". */
export const flag = () => z.preprocess((v) => v === true || v === 1 || ["true", "1", "on", "yes"].includes(String(v).toLowerCase()), z.boolean());

export { z };
