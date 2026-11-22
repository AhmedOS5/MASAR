import { z, text, nullableText, nullableDate, nullableId, requiredId } from "../../lib/validate.js";
import { priority, PRIORITIES } from "../requests/schema.js";

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done"];

const status = z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(TASK_STATUSES));
const progress = z.coerce.number().int().min(0).max(100);
const priorityLoose = z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(PRIORITIES));

export const createTaskSchema = z.object({
  title: text(255),
  description: nullableText(5000).optional(),
  assignee_id: nullableId().optional(),
  department: nullableText(100).optional(),
  type: nullableText(100).optional(),
  priority: priority(),
  due_date: nullableDate().optional(),
  project_id: requiredId(), // every task belongs to a project
});

// PATCH: every field optional; absent = unchanged, ""/null = clear (where the column allows it).
// Fields not listed here (code, creator_id, organization_id, request_id …) can never be set by a client.
export const updateTaskSchema = z.object({
  title: text(255).optional(),
  description: nullableText(5000).optional(),
  assignee_id: nullableId().optional(),
  department: nullableText(100).optional(),
  type: nullableText(100).optional(),
  priority: priorityLoose.optional(),
  due_date: nullableDate().optional(),
  status: status.optional(),
  progress: progress.optional(),
});

/** The only fields an assignee without `tasks.update` may change on their own task. */
export const ASSIGNEE_FIELDS = new Set(["status", "progress"]);
