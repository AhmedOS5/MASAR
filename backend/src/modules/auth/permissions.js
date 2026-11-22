// The permission catalog. Roles (DB) hold a subset of these keys; routes declare the key they need via
// app.guard({ permission }). A role with is_system_admin implicitly holds every key.
// GET /permissions serves this list (label = Arabic display text).

export const PERMISSIONS = [
  { key: "requests.view", label: "عرض الطلبات" },
  { key: "requests.create", label: "إنشاء الطلبات" },
  { key: "requests.approve", label: "الموافقة على الطلبات ورفضها" },
  { key: "tasks.view", label: "عرض المهام" },
  { key: "tasks.create", label: "إنشاء المهام" },
  { key: "tasks.update", label: "تعديل المهام وإسنادها" },
  { key: "employees.view", label: "عرض الموظفين" },
  { key: "employees.manage", label: "إدارة الموظفين" },
  { key: "roles.view", label: "عرض الأدوار والصلاحيات" },
  { key: "roles.manage", label: "إدارة الأدوار والصلاحيات" },
  { key: "files.view", label: "عرض الملفات" },
  { key: "files.upload", label: "رفع الملفات" },
  { key: "reports.view", label: "عرض التقارير" },
  { key: "reports.manage", label: "رفع التقارير وإدارتها" },
  { key: "units.view", label: "عرض الوحدات" },
  { key: "units.manage", label: "تفعيل الوحدات وتعطيلها" },
  { key: "settings.manage", label: "إدارة القوائم والإعدادات" },
  { key: "meal.view", label: "عرض المتابعة والتقييم" },
  { key: "meal.manage", label: "إدارة المتابعة والتقييم" },
  { key: "projects.view", label: "عرض المشاريع" },
  { key: "projects.manage", label: "إنشاء المشاريع وتعيين فرق العمل" },
  { key: "beneficiaries.view", label: "عرض المستفيدين وبياناتهم" },
  { key: "beneficiaries.edit", label: "إضافة المستفيدين وتعديل بياناتهم" },
];

export const PERMISSION_KEYS = new Set(PERMISSIONS.map((p) => p.key));
export const isPermissionKey = (key) => PERMISSION_KEYS.has(key);
