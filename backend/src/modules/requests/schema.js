import { z, text, optText, optNumber, requiredId } from "../../lib/validate.js";

export const REQUEST_STATUSES = ["draft", "pending", "approved", "in_progress", "completed", "rejected"];
export const PRIORITIES = ["low", "medium", "high", "urgent"];

/** "" / null / missing => "medium"; anything else must be one of the four codes (case-insensitive). */
export const priority = () =>
  z.preprocess(
    (v) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? "medium" : typeof v === "string" ? v.trim().toLowerCase() : v),
    z.enum(PRIORITIES),
  );

export const createRequestSchema = z.object({
  title: text(255),
  type: text(100),
  department: optText(100),
  priority: priority(),
  amount: optNumber({ max: 1_000_000_000 }),
  description: optText(5000),
  project_id: requiredId(), // every request belongs to a project
});

export const commentSchema = z.object({ body: text(5000) });
export const rejectSchema = z.object({ reason: text(1000) });
