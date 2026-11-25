// Arabic labels for backend enum CODES. Backend sends codes (snake_case); the UI owns wording.
// `tone` maps to the existing CSS-module classes (status_<tone>, prio_<tone>, ...).

export const REQUEST_STATUS = {
  draft: { label: "مسودة", tone: "draft" },
  pending: { label: "قيد الانتظار", tone: "wait" },
  approved: { label: "موافق عليه", tone: "success" },
  in_progress: { label: "قيد التنفيذ", tone: "progress" },
  completed: { label: "مكتمل", tone: "done" },
  rejected: { label: "مرفوض", tone: "reject" },
};

export const TASK_STATUS = {
  todo: { label: "للتنفيذ", tone: "wait" },
  in_progress: { label: "قيد التنفيذ", tone: "progress" },
  blocked: { label: "محظور", tone: "reject" },
  done: { label: "مكتمل", tone: "done" },
};

export const PRIORITY = {
  low: { label: "منخفضة", tone: "low" },
  medium: { label: "متوسطة", tone: "medium" },
  high: { label: "عالية", tone: "high" },
  urgent: { label: "عاجلة", tone: "urgent" },
};

export const COMPLAINT_STATUS = {
  new: { label: "جديدة", cls: "stNew" },
  in_progress: { label: "قيد المعالجة", cls: "stProcessing" },
  resolved: { label: "تم الحل", cls: "stResolved" },
  closed: { label: "مغلقة", cls: "stClosed" },
};

export const COMPLAINT_PRIORITY = {
  low: { label: "منخفضة", cls: "prioLow" },
  medium: { label: "متوسطة", cls: "prioMedium" },
  high: { label: "عالية", cls: "prioHigh" },
  sensitive: { label: "حساسة", cls: "prioSensitive" },
};

export const INDICATOR_STATUS = {
  on_track: { label: "على المسار", cls: "onTrack", color: "#16a34a" },
  needs_follow: { label: "بحاجة متابعة", cls: "needsFollow", color: "#2563eb" },
  delayed: { label: "متأخر", cls: "delayed", color: "#f59e0b" },
  achieved: { label: "محققة", cls: "achieved", color: "#16a34a" },
};

export const MEAL_REPORT_STATUS = {
  draft: { label: "مسودة", cls: "stDraft" },
  in_review: { label: "قيد المراجعة", cls: "stReview" },
  needs_edit: { label: "بحاجة تعديل", cls: "stEdit" },
  approved: { label: "معتمد", cls: "stApproved" },
};

export const FIELD_RECORD_STATUS = {
  draft: { label: "مسودة", cls: "documenting" },
  documenting: { label: "قيد التوثيق", cls: "documenting" },
  in_review: { label: "قيد المراجعة", cls: "reviewing" },
  completed: { label: "مكتمل", cls: "done" },
};

export const ACTIVITY_STATUS = {
  completed: { label: "مكتمل", cls: "done" },
  sensitive: { label: "حساسة", cls: "sensitive" },
  in_progress: { label: "قيد المعالجة", cls: "processing" },
  documenting: { label: "قيد التوثيق", cls: "documenting" },
};

export const ACTIVITY_TYPE_STYLE = { complaint: "typeRed", visit: "typeTeal", activity: "typeBlue" };

export const UNIT_STATUS = {
  active: { label: "مفعّلة", color: "#16a34a", tone: "success" },
  inactive: { label: "غير مفعّلة", color: "#94a3b8", tone: "neutral" },
  in_development: { label: "قيد التطوير", color: "#f59e0b", tone: "warning" },
  setup_required: { label: "تحتاج إلى إعداد", color: "#f59e0b", tone: "warning" },
};

export const UNIT_TIER = { core: "أساسية", optional: "اختيارية" };

export const NOTIFICATION_TYPES = ["system", "task", "alert"];

// Legacy status/priority tone names -> the shared badge variants in components/ui/ui.module.css (badge_<variant>).
export const BADGE_TONE = {
  draft: "neutral",
  wait: "warning",
  success: "success",
  progress: "info",
  done: "success",
  reject: "danger",
  urgent: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};
export const badgeTone = (tone) => BADGE_TONE[tone] ?? "neutral";

export const pick = (map, key, fallback) =>
  map[key] ?? fallback ?? { label: key ?? "—", tone: "draft", cls: "" };

// Severity levels returned by insight/alert endpoints -> dot / value colours.
export const LEVEL_COLOR = {
  danger: "#dc2626",
  warning: "#f59e0b",
  info: "#2563eb",
  success: "#16a34a",
  neutral: "#0f172a",
};
export const levelColor = (level) => LEVEL_COLOR[level] ?? LEVEL_COLOR.neutral;

export const QUARTER_LABELS = { Q1: "الربع الأول", Q2: "الربع الثاني", Q3: "الربع الثالث", Q4: "الربع الرابع" };
export const DISTRIBUTION_COLORS = ["#2563eb", "#065f46", "#16a34a", "#f59e0b", "#7c3aed", "#0ea5e9"];

// Organization lifecycle (platform operator console). `tone` -> ui.module.css badge_<tone>.
export const ORG_STATUS = {
  incomplete: { label: "لم تُكمل التسجيل", tone: "neutral" },
  pending_approval: { label: "بانتظار الاعتماد", tone: "warning" },
  approved: { label: "نشطة", tone: "success" },
  suspended: { label: "معلّقة", tone: "danger" },
  rejected: { label: "مرفوضة", tone: "danger" },
};

export const ORG_TYPE = {
  ngo: "منظمة غير حكومية",
  ingo: "منظمة دولية",
  gov: "جهة حكومية",
  company: "شركة",
};

// What an e-mailed code is for follows from the account's state (see backend auth/service.js).
export const CODE_KIND = {
  verification: "تأكيد البريد الإلكتروني",
  invitation: "دعوة لإنشاء كلمة المرور",
  password_reset: "إعادة تعيين كلمة المرور",
};

// ---- projects ----
export const PROJECT_STATUS = {
  active: { label: "نشط", tone: "success" },
  completed: { label: "مكتمل", tone: "info" },
  archived: { label: "مؤرشف", tone: "neutral" },
};
export const PROJECT_ROLE = {
  admin: "مدير النظام",
  supervisor: "مشرف",
  member: "عضو فريق",
};
export const BENEFICIARY_STATUS = {
  active: { label: "نشط", tone: "success" },
  inactive: { label: "غير نشط", tone: "neutral" },
};
export const GENDER = { male: "ذكر", female: "أنثى" };
