// Reference data: the global catalog of product units. Organizations toggle them through `org_units`
// (no row => default: enabled iff tier = core). Ids are fixed so they stay stable across environments.
// roles_count = permission keys the unit uses; screens_count = real pages in the frontend.
// Change the catalog with a new migration (never edit applied ones).

const UNITS = [
  {
    id: 1,
    key: "meal",
    title: "المتابعة والتقييم",
    description: "مؤشرات الأداء، الشكاوى والملاحظات، التقارير الدورية والبيانات الميدانية.",
    tier: "core",
    availability: "available",
    roles_count: 2, // meal.view, meal.manage
    screens_count: 5, // dashboard, indicators, field data, complaints, reports
    manager_roles: "مدير المتابعة والتقييم",
    icon: "bar-chart",
    href: "/dashboard/meal",
    sort_order: 1,
  },
  {
    id: 2,
    key: "field_ops",
    title: "العمليات الميدانية",
    description: "تخطيط الزيارات الميدانية ومتابعة الفرق في المواقع.",
    tier: "core",
    availability: "available",
    roles_count: 0,
    screens_count: 0,
    manager_roles: "مشرف ميداني",
    icon: "map-pin",
    href: null,
    sort_order: 2,
  },
  {
    id: 3,
    key: "hr",
    title: "الموارد البشرية",
    description: "ملفات الموظفين والإجازات والتقييم الوظيفي.",
    tier: "optional",
    availability: "in_development",
    roles_count: 0,
    screens_count: 0,
    manager_roles: null,
    icon: "users",
    href: null,
    sort_order: 3,
  },
];

export async function up(knex) {
  await knex("units").insert(UNITS);
}

export async function down(knex) {
  await knex("org_units").whereIn("unit_id", UNITS.map((u) => u.id)).del();
  await knex("units").whereIn("id", UNITS.map((u) => u.id)).del();
}
