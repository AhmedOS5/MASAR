import { z, id, text, nullableText, nullableDate } from "../../lib/validate.js";
import { PROJECT_ROLES } from "./access.js";

export const PROJECT_STATUSES = ["active", "completed", "archived"];
export const BENEFICIARY_STATUSES = ["active", "inactive"];
export const GENDERS = ["male", "female"];

const lower = (v) => (typeof v === "string" ? v.trim().toLowerCase() : v);
const projectStatus = z.preprocess((v) => (v === "" || v === null ? undefined : lower(v)), z.enum(PROJECT_STATUSES).optional());
const nullableEnum = (values) => z.preprocess((v) => (v === "" || v === null ? null : lower(v)), z.enum(values).nullable());
const nullableCount = () => z.preprocess((v) => (v === "" || v === null ? null : v), z.coerce.number().int().min(0).max(1000).nullable());

const datesInOrder = (v) => !v.start_date || !v.end_date || v.end_date >= v.start_date;
const datesMessage = { message: "تاريخ النهاية يجب ألا يسبق تاريخ البداية.", path: ["end_date"] };

export const createProjectSchema = z
  .object({
    name: text(255),
    description: nullableText(5000).optional(),
    status: projectStatus,
    start_date: nullableDate().optional(),
    end_date: nullableDate().optional(),
  })
  .refine(datesInOrder, datesMessage);

// PUT is a merge: only the fields that are present change ("" clears description / dates).
export const updateProjectSchema = z
  .object({
    name: text(255).optional(),
    description: nullableText(5000).optional(),
    status: projectStatus,
    start_date: nullableDate().optional(),
    end_date: nullableDate().optional(),
  })
  .refine(datesInOrder, datesMessage);

const projectRole = z.preprocess((v) => (v === undefined || v === null || v === "" ? "member" : lower(v)), z.enum(PROJECT_ROLES));
export const membersSchema = z.object({
  members: z.array(z.object({ user_id: id(), project_role: projectRole })).max(500),
});

const beneficiaryFields = {
  full_name: text(255),
  national_id: nullableText(30),
  gender: nullableEnum(GENDERS),
  birth_date: nullableDate(),
  phone: nullableText(50),
  region: nullableText(100),
  address: nullableText(500),
  household_size: nullableCount(),
  notes: nullableText(5000),
};
export const createBeneficiarySchema = z.object({
  ...beneficiaryFields,
  national_id: beneficiaryFields.national_id.optional(),
  gender: beneficiaryFields.gender.optional(),
  birth_date: beneficiaryFields.birth_date.optional(),
  phone: beneficiaryFields.phone.optional(),
  region: beneficiaryFields.region.optional(),
  address: beneficiaryFields.address.optional(),
  household_size: beneficiaryFields.household_size.optional(),
  notes: beneficiaryFields.notes.optional(),
  status: z.preprocess((v) => (v === "" || v === null || v === undefined ? "active" : lower(v)), z.enum(BENEFICIARY_STATUSES)),
});
export const updateBeneficiarySchema = z.object(
  Object.fromEntries([...Object.entries(beneficiaryFields).map(([k, s]) => [k, s.optional()]), ["status", z.preprocess(lower, z.enum(BENEFICIARY_STATUSES)).optional()]]),
);
