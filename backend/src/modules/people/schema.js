import { z, text, email, nullableText, nullableId } from "../../lib/validate.js";
import { JOB_CATEGORY_KEYS } from "./job-roles.js";

export const EMPLOYEE_STATUSES = ["active", "inactive"];

const lower = (v) => (typeof v === "string" ? v.trim().toLowerCase() : v);
const statusOnCreate = z.preprocess((v) => (v === undefined || v === null || v === "" ? "active" : lower(v)), z.enum(EMPLOYEE_STATUSES));
const statusOnUpdate = z.preprocess(lower, z.enum(EMPLOYEE_STATUSES));

// "" / null clear the category; anything else must be a key of the job-roles catalog.
const jobCategory = z.preprocess((v) => (v === null || v === "" ? null : typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(JOB_CATEGORY_KEYS).nullable());

export const createEmployeeSchema = z.object({
  name: text(255),
  email: email(),
  phone: nullableText(50).optional(),
  role_id: nullableId().optional(),
  department: nullableText(100).optional(),
  job_title: nullableText(100).optional(),
  job_category: jobCategory.optional(),
  status: statusOnCreate,
});

// PUT is applied as a merge: only the fields that are present change ("" clears phone/department/role).
export const updateEmployeeSchema = z.object({
  name: text(255).optional(),
  email: email().optional(),
  phone: nullableText(50).optional(),
  role_id: nullableId().optional(),
  department: nullableText(100).optional(),
  job_title: nullableText(100).optional(),
  job_category: jobCategory.optional(),
  status: statusOnUpdate.optional(),
});

const permissionList = z.preprocess((v) => v ?? [], z.array(z.string().trim().min(1).max(100)).max(100));

export const createRoleSchema = z.object({ title: text(100), permissions: permissionList });
export const updateRoleSchema = z.object({ title: text(100).optional(), permissions: z.array(z.string().trim().min(1).max(100)).max(100).optional() });
