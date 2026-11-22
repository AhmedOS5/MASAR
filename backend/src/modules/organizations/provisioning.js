// What a brand-new organization starts with. Runs inside the registration transaction.
import { PERMISSIONS } from "../auth/permissions.js";

export const ADMIN_ROLE_TITLE = "مدير النظام";

/** Default select-box values for GET /options. `periods` is generated from the current year. */
export function defaultOptions(now = new Date()) {
  const y = now.getUTCFullYear();
  return {
    departments: ["العمليات", "المالية", "الموارد البشرية", "المتابعة والتقييم"],
    request_types: ["مشتريات", "لوجستيات", "سلفة مالية", "سفر"],
    task_types: ["تدريب", "متابعة", "زيارة ميدانية", "إدارية"],
    sectors: ["المياه والصرف الصحي", "الصحة", "التعليم", "الحماية", "الأمن الغذائي"],
    regions: ["غزة", "الضفة الغربية", "القدس"],
    activity_types: ["توزيع مساعدات", "جلسة تدريب", "زيارة ميدانية", "ورشة عمل"],
    complaint_types: ["تأخير توزيع", "نقص مواد", "سلوك الموظفين", "أخرى"],
    channels: ["الهاتف", "نموذج إلكتروني", "صندوق الشكاوى", "زيارة مباشرة"],
    report_types: ["مالي", "تقرير متابعة", "تقرير ربعي"],
    periods: [1, 2, 3, 4].map((q) => `Q${q} ${y}`),
  };
}

/** Creates the organization's first role, admin user and lookup values. Returns { organizationId, userId }. */
export async function provisionOrganization(trx, { org, admin }) {
  const [{ id: organizationId }] = await trx("organizations").insert(
    { name: org.name, type: org.type, email: org.email, phone: org.phone, region: org.region, status: "incomplete" },
    ["id"],
  );

  const [{ id: roleId }] = await trx("roles").insert(
    { organization_id: organizationId, title: ADMIN_ROLE_TITLE, is_system_admin: true },
    ["id"],
  );
  // The admin role is flagged is_system_admin (=> every permission); rows keep the UI's permission list accurate.
  await trx("role_permissions").insert(PERMISSIONS.map((p) => ({ role_id: roleId, permission_key: p.key })));

  const [{ id: userId }] = await trx("users").insert(
    {
      organization_id: organizationId,
      role_id: roleId,
      name: admin.name,
      email: admin.email,
      phone: org.phone,
      password_hash: admin.passwordHash,
      status: "active",
    },
    ["id"],
  );

  const rows = [];
  for (const [kind, values] of Object.entries(defaultOptions())) {
    values.forEach((value, i) => rows.push({ organization_id: organizationId, kind, value, sort_order: i }));
  }
  await trx("options").insert(rows);

  return { organizationId, userId };
}
