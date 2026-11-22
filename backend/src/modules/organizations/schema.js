import { z, text, optText, email, optInt } from "../../lib/validate.js";
import { FREE_EMAIL_DOMAINS, emailDomain } from "../auth/schema.js";

// Same casing tolerance as registration ("NGO" | "Gov" | "Company" | "INGO"), but no default:
// name and type are locked after registration, so this field is validated and then ignored.
const lockedType = z.preprocess(
  (v) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : undefined),
  z.enum(["ngo", "ingo", "gov", "company"]).optional(),
);

export const onboardingSchema = z.object({
  organization_name: optText(255), // locked: accepted, ignored
  organization_type: lockedType, //   locked: accepted, ignored
  registration_number: text(100),
  country: text(100),
  phone: text(50).refine((v) => v.length >= 8, { message: "يرجى إدخال رقم هاتف صالح." }),
  email: email().refine((v) => !FREE_EMAIL_DOMAINS.has(emailDomain(v)), {
    message: "يرجى استخدام بريد مؤسسة رسمي (غير مسموح ببريد مجاني Gmail/Yahoo).",
  }),
  address: optText(500),
  contact_person_name: text(255),
  sectors: z.preprocess((v) => v ?? [], z.array(text(100)).max(30)),
  organization_size: optText(50),
  years_of_experience: optInt({ max: 200 }),
  notes: optText(5000),
});

export const rejectSchema = z.object({ reason: text(1000) });
export const reasonSchema = z.object({ reason: optText(1000) });

export const ORG_STATUSES = ["incomplete", "pending_approval", "approved", "rejected", "suspended"];

export const platformListSchema = z.object({
  status: z.enum(ORG_STATUSES).optional().catch(undefined),
  search: z.string().optional(),
  page: z.any().optional(),
  per_page: z.any().optional(),
});
