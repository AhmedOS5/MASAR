// Job category -> default role -> permission package. A fixed, deterministic catalog (no learning, no AI): the organization
// does not invent job titles with new permissions; every employee belongs to one of these categories and gets its package.
// A package is split the way the product talks about it: what the person may SEE (`view`) and what they may CHANGE (`edit`).
//
// The four employee categories (the platform operator and the organization's system admin are not job categories):
//   manager   مدير / مشرف مشاريع        finance   مسؤول مالي
//   meal      متابعة وتقييم / ميداني     employee  موظف
//
// Rules of the catalog:
//  * a package never holds `roles.manage`, `settings.manage`, `employees.manage`, `units.manage` or `projects.manage` —
//    organization administration (and creating projects / building their teams) stays with the system admin;
//  * `view` holds only `*.view` keys, `edit` only the others;
//  * a title is matched to a category in the order below, most specific first ("مدير مالي" is finance, not manager);
//    an unrecognised title falls back to the least-privileged category, `employee`.
// The package says WHAT a person may do; project membership (projects module) says WHERE.
import { PERMISSION_KEYS } from "../auth/permissions.js";

export const ADMIN_ONLY = ["roles.manage", "settings.manage", "employees.manage", "units.manage", "projects.manage"];

const category = (c) => ({ ...c, permissions: [...c.view, ...c.edit] });

export const JOB_CATEGORIES = [
  category({
    key: "manager",
    label: "الإدارة والإشراف على المشاريع",
    role_title: "مدير",
    view: ["requests.view", "tasks.view", "employees.view", "roles.view", "files.view", "reports.view", "units.view", "meal.view", "projects.view", "beneficiaries.view"],
    edit: ["requests.create", "requests.approve", "tasks.create", "tasks.update", "files.upload", "reports.manage", "beneficiaries.edit"],
    ar: ["مدير", "رئيس", "مشرف"],
    en: ["manager", "director", "executive", "supervisor", "chief", "president", "head"],
  }),
  category({
    key: "meal",
    label: "المتابعة والتقييم والعمل الميداني",
    role_title: "مسؤول متابعة وتقييم",
    view: ["requests.view", "tasks.view", "files.view", "reports.view", "units.view", "meal.view", "projects.view", "beneficiaries.view"],
    edit: ["requests.create", "tasks.create", "tasks.update", "files.upload", "reports.manage", "meal.manage", "beneficiaries.edit"],
    ar: ["متابعه", "تقييم", "ميدان", "باحث", "رصد"],
    en: ["m&e", "meal", "monitoring", "evaluation", "field", "researcher"],
  }),
  category({
    key: "finance",
    label: "المالية",
    role_title: "مسؤول مالي",
    view: ["requests.view", "tasks.view", "files.view", "reports.view", "units.view", "projects.view"],
    edit: ["requests.create", "requests.approve", "files.upload", "reports.manage"],
    ar: ["مالي", "محاسب", "صراف", "امين صندوق"],
    en: ["finance", "financial", "accountant", "accounting", "treasurer", "bookkeeper"],
  }),
  category({
    key: "employee",
    label: "موظف",
    role_title: "موظف",
    view: ["requests.view", "tasks.view", "files.view", "reports.view", "units.view", "projects.view"],
    edit: ["requests.create", "files.upload"],
    ar: [],
    en: [],
  }),
];

// Most specific first. `employee` is the fallback, never matched by keyword.
const MATCH_ORDER = ["finance", "meal", "manager"];

export const JOB_CATEGORY_KEYS = JOB_CATEGORIES.map((c) => c.key);
export const defaultRoleFor = (key) => JOB_CATEGORIES.find((c) => c.key === key);

for (const c of JOB_CATEGORIES) {
  for (const k of c.permissions) if (!PERMISSION_KEYS.has(k)) throw new Error(`job-roles: unknown permission ${k}`);
}

/** What GET /job-categories serves: the packages without the matching keywords. */
export const publicCatalog = () =>
  JOB_CATEGORIES.map(({ key, label, role_title, view, edit, permissions }) => ({ key, label, role_title, view: [...view], edit: [...edit], permissions: [...permissions] }));

/** Arabic spelling variants folded together: أإآ→ا, ى→ي, ة→ه, no diacritics / tatweel. */
const normalize = (s) =>
  String(s)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");

const arabic = new Map(JOB_CATEGORIES.map((c) => [c.key, c.ar.map(normalize)]));

/** Latin keywords match whole words: short ones exactly, long ones also as a prefix ("financial", "managers"). */
const latinMatches = (words, kw) => words.some((w) => w === kw || (kw.length >= 6 && w.startsWith(kw)));

/** The job category for a free-text title: a key of JOB_CATEGORIES, or null when there is no title. */
export function categoryForTitle(title) {
  if (typeof title !== "string" || !title.trim()) return null;
  const t = normalize(title);
  const words = t.match(/[a-z0-9&]+/g) ?? [];
  for (const key of MATCH_ORDER) {
    const c = defaultRoleFor(key);
    if (arabic.get(key).some((kw) => t.includes(kw)) || c.en.some((kw) => latinMatches(words, kw))) return key;
  }
  return "employee";
}
