import { z, text, optText, optId, optInt, optNumber, dateOnly, nullableId, requiredId } from "../../lib/validate.js";

export const COMPLAINT_STATUSES = ["new", "in_progress", "resolved", "closed"];
export const COMPLAINT_PRIORITIES = ["low", "medium", "high", "sensitive"];
export const MEAL_REPORT_STATUSES = ["draft", "in_review", "needs_edit", "approved"];
export const INDICATOR_STATUSES = ["on_track", "needs_follow", "delayed", "achieved"];
export const FIELD_RECORD_STATUSES = ["draft", "submitted"];

const lower = (v) => (typeof v === "string" ? v.trim().toLowerCase() : v);
const oneOf = (values) => z.preprocess(lower, z.enum(values));
const blankTo = (fallback) => (v) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? fallback : lower(v));
const money = () => z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().min(0).max(1_000_000_000_000));

// ------------------------------------------------------------------ complaints
export const createComplaintSchema = z.object({
  type: text(150),
  project_id: requiredId(), // MEAL data belongs to a project
  channel: text(150),
  region: optText(150),
  priority: z.preprocess(blankTo("medium"), z.enum(COMPLAINT_PRIORITIES)),
  reporter_name: optText(255),
  description: optText(5000),
});

export const updateComplaintSchema = z
  .object({ status: oneOf(COMPLAINT_STATUSES).optional(), owner_id: nullableId().optional() })
  .refine((d) => d.status !== undefined || d.owner_id !== undefined, { message: "الحقل مطلوب.", path: ["status"] });

// ------------------------------------------------------------------ indicators
export const createIndicatorSchema = z.object({
  code: text(50),
  name: text(255),
  project_id: requiredId(),
  sector: optText(150),
  target: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().positive("أدخل قيمة مستهدفة صحيحة.").max(1_000_000_000_000)),
  owner_id: nullableId().optional(),
});

export const updateIndicatorSchema = z
  .object({ achieved: money().optional(), owner_id: nullableId().optional() })
  .refine((d) => d.achieved !== undefined || d.owner_id !== undefined, { message: "الحقل مطلوب.", path: ["achieved"] });

// ------------------------------------------------------------------ MEAL reports
export const createMealReportSchema = z.object({
  title: text(255),
  type: text(150),
  project_id: requiredId(),
  period: optText(100),
  template_id: optId(),
});
export const updateMealReportSchema = z.object({ status: oneOf(MEAL_REPORT_STATUSES) });

// ------------------------------------------------------------------ field records
export const fieldRecordSchema = z
  .object({
    project_id: requiredId(), // even a draft belongs to a project
    sector: optText(150),
    activity_type: optText(150),
    activity_date: dateOnly(),
    title: optText(255),
    description: optText(5000),
    region: optText(150),
    location: optText(255),
    indicator_id: optId(),
    achieved_value: optNumber({ max: 1_000_000_000_000 }),
    total_beneficiaries: optInt({ max: 1_000_000_000 }),
    status: z.preprocess(blankTo("draft"), z.enum(FIELD_RECORD_STATUSES)),
  })
  .superRefine((d, ctx) => {
    if (d.status !== "submitted") return; // drafts may be incomplete
    for (const f of ["sector", "activity_type", "activity_date", "region", "indicator_id", "achieved_value"]) {
      if (d[f] === undefined) ctx.addIssue({ code: "custom", path: [f], message: "الحقل مطلوب." });
    }
  });
