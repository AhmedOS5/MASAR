// Demo / e2e fixture. It deliberately mirrors the data of scripts/mock-backend.mjs (same logins, titles, counts and
// ids) so the frontend can be exercised against this backend exactly as against the mock.
//
//   admin@org.org    Passw0rd!   approved organization «منظمة النور»  (system admin)
//   jalal@org.org    Passw0rd!   same organization, role «باحث ميداني» (tasks.view only)
//   pending@org.org  Passw0rd!   organization waiting for approval
//   new@org.org      Passw0rd!   organization that has not finished onboarding
//   ops@masar.io     Passw0rd!   platform operator (approves organizations)
//
// seedDemo() is idempotent (does nothing when admin@org.org exists). NEVER run it in production: it creates accounts
// with a published password.
import { hashPassword } from "../lib/password.js";
import { nowIso } from "../lib/time.js";
import { provisionOrganization } from "../modules/organizations/provisioning.js";
import { indicatorStatus } from "../modules/meal/indicators-core.js";
import fs from "node:fs";

export const DEMO_PASSWORD = "Passw0rd!";

const OPTIONS = {
  departments: ["العمليات", "المالية", "الموارد البشرية"],
  request_types: ["مشتريات", "لوجستيات"],
  task_types: ["تدريب", "متابعة"],
  projects: ["مشروع ألف", "مشروع باء"],
  sectors: ["المياه", "الصحة"],
  regions: ["غزة", "الضفة", "القدس"],
  activity_types: ["توزيع مساعدات", "جلسة تدريب"],
  complaint_types: ["تأخير توزيع", "نقص مواد"],
  channels: ["الهاتف", "نموذج إلكتروني"],
  report_types: ["مالي", "تقرير متابعة", "تقرير ربعي"], // «تقرير ربعي» = the type of the built-in quarterly template
  periods: ["Q1 2026", "Q2 2026"],
};

// Children before parents. Global reference data (units, built-in report templates) is kept.
const RESETTABLE = [
  "indicator_updates", "attachments", "notifications", "request_activities", "request_comments", "task_comments", "tasks", "requests",
  "files", "folders", "reports", "beneficiaries", "project_members", "projects", "meal_reports", "field_records", "indicators", "complaints", "org_units", "options", "counters",
  "auth_tokens", "role_permissions", "users", "roles", "organization_profiles", "organizations",
];

/** Empty every tenant table, restart the id sequences, drop stored files. Used by /__control/reset and db:reset. */
export async function wipeData(db, { uploadDir } = {}) {
  await db("report_templates").whereNotNull("organization_id").del();
  // DELETE (children first) rather than TRUNCATE … CASCADE: on PostgreSQL the cascade would also empty report_templates,
  // whose built-in rows (organization_id NULL) are reference data that must survive.
  for (const t of RESETTABLE) await db(t).del();
  if (db.client.config.client === "pg") {
    for (const t of RESETTABLE) {
      if (await db.schema.hasColumn(t, "id")) await db.raw("select setval(pg_get_serial_sequence(?, 'id'), 1, false)", [t]); // tables with a composite key have no id sequence
    }
  } else {
    const keep = ["units", "report_templates", "knex_migrations", "knex_migrations_lock"];
    await db("sqlite_sequence").whereNotIn("name", keep).del();
  }
  if (uploadDir) fs.rmSync(uploadDir, { recursive: true, force: true });
}

const iso = (d) => new Date(d).toISOString();

/** @returns {{ skipped: true } | { organizationId: number }} */
export async function seedDemo(db, { storage, scryptLogN = 15 } = {}) {
  if (await db("users").where({ email: "admin@org.org" }).first("id")) return { skipped: true };
  const passwordHash = await hashPassword(DEMO_PASSWORD, { logN: scryptLogN });
  const verified = nowIso();
  const now = Date.now();
  const ago = (days) => iso(now - days * 86_400_000);

  return db.transaction(async (trx) => {
    // ------------------------------------------------------------ organizations
    const mk = async (org, admin, status, extra = {}) => {
      const ids = await provisionOrganization(trx, { org, admin: { ...admin, passwordHash } });
      await trx("organizations").where({ id: ids.organizationId }).update({ status, ...(status === "approved" ? { approved_at: nowIso() } : {}) });
      await trx("users").where({ id: ids.userId }).update({ email_verified_at: verified });
      if (extra.profile) {
        await trx("organization_profiles").insert({ organization_id: ids.organizationId, ...extra.profile, sectors: JSON.stringify(["health"]), submitted_at: nowIso() });
      }
      return ids;
    };
    const main = await mk({ name: "منظمة النور", type: "ngo", email: "info@alnoor.org", phone: "+970 59 111 2222", region: "غزة" }, { name: "ليلى المحمود", email: "admin@org.org" }, "approved");
    await mk({ name: "مؤسسة قيد المراجعة", type: "ngo", email: "info@pending.org", phone: "+970 59 333 4444", region: "غزة" }, { name: "سامر", email: "pending@org.org" }, "pending_approval", {
      profile: { registration_number: "PS-2026-77", country: "PS", contact_person_name: "سامر" },
    });
    await mk({ name: "مؤسسة جديدة", type: "gov", email: "new@new.org", phone: "", region: "الضفة" }, { name: "نورا", email: "new@org.org" }, "incomplete");
    await trx("users").insert({ name: "فريق مسار", email: "ops@masar.io", password_hash: passwordHash, is_platform_admin: true, status: "active", email_verified_at: verified });

    const org = main.organizationId;
    const admin = main.userId;
    await trx("roles").where({ organization_id: org, is_system_admin: true }).update({ title: "مديرة النظام" });

    // lists used by every select box
    await trx("options").where({ organization_id: org }).del();
    const optionRows = [];
    for (const [kind, values] of Object.entries(OPTIONS)) values.forEach((value, i) => optionRows.push({ organization_id: org, kind, value, sort_order: i }));
    await trx("options").insert(optionRows);

    // ------------------------------------------------------------ roles & employees
    const role = async (title, permissions) => {
      const [{ id }] = await trx("roles").insert({ organization_id: org, title, is_system_admin: false }, ["id"]);
      await trx("role_permissions").insert(permissions.map((permission_key) => ({ role_id: id, permission_key })));
      return id;
    };
    const researcher = await role("باحث ميداني", ["tasks.view"]);
    const opsManager = await role("مدير عمليات", ["tasks.view", "reports.view"]);
    const mealOfficer = await role("مسؤول المتابعة والتقييم", ["meal.view", "meal.manage"]);
    const employee = async (name, email, role_id, department, status, withLogin = false) => {
      const [{ id }] = await trx("users").insert(
        { organization_id: org, role_id, name, email, department, status, ...(withLogin ? { password_hash: passwordHash, email_verified_at: verified } : {}) },
        ["id"],
      );
      return id;
    };
    const jalal = await employee("جلال العمر", "jalal@org.org", researcher, "العمليات", "active", true);
    await employee("منى سالم", "mona@org.org", opsManager, "المالية", "inactive");
    const hala = await employee("هالة", "hala@org.org", mealOfficer, null, "active");
    const salma = await employee("سلمى", "salma@org.org", mealOfficer, null, "active");
    const dalia = await employee("داليا", "dalia@org.org", mealOfficer, null, "active");

    // ------------------------------------------------------------ projects: every request, task, folder, file and report lives in one
    const [alef, baa] = await Promise.all(
      OPTIONS.projects.map(async (name, i) => (await trx("projects").insert({ organization_id: org, code: `PRJ-${String(i + 1).padStart(3, "0")}`, name, status: "active", created_by: admin }, ["id"]))[0].id),
    );
    await trx("project_members").insert([
      { project_id: alef, user_id: jalal, project_role: "member" },
      { project_id: baa, user_id: jalal, project_role: "member" },
    ]);
    const projectOf = (i) => (i % 2 === 0 ? alef : baa);

    // ------------------------------------------------------------ requests (23) & tasks (12)
    const DEPT = ["العمليات", "المالية", "الموارد البشرية"];
    const REQ_STATUS = ["pending", "approved", "in_progress", "completed", "rejected", "draft"];
    const PRIORITY = ["low", "medium", "high", "urgent"];
    const requestRows = Array.from({ length: 23 }, (_, i) => {
      const status = REQ_STATUS[i % 6];
      const created = iso(Date.UTC(2026, 2, 1 + (i % 28)));
      return {
        organization_id: org, code: `REQ-${String(i + 1).padStart(3, "0")}`, title: `طلب اختبار رقم ${i + 1}`, status, priority: PRIORITY[i % 4],
        type: i % 2 ? "مشتريات" : "لوجستيات", department: DEPT[i % 3], description: `وصف الطلب ${i + 1}`, amount: 1000 + i * 100, project_id: projectOf(i), requester_id: jalal, // the admin decides (separation of duties: never one's own request)
        decided_by: ["approved", "in_progress", "completed", "rejected"].includes(status) ? admin : null,
        decided_at: ["approved", "in_progress", "completed", "rejected"].includes(status) ? created : null,
        rejection_reason: status === "rejected" ? "خارج الميزانية" : null, created_at: created, updated_at: created,
      };
    });
    await trx("requests").insert(requestRows);
    const requests = await trx("requests").where({ organization_id: org }).orderBy("id");
    const activities = [];
    for (const r of requests) {
      activities.push({ request_id: r.id, actor_id: admin, kind: "created", text: "تم إنشاء الطلب", created_at: r.created_at });
      if (["approved", "in_progress", "completed"].includes(r.status)) activities.push({ request_id: r.id, actor_id: admin, kind: "reviewed", text: "تمت الموافقة", created_at: r.created_at });
      if (r.status === "rejected") activities.push({ request_id: r.id, actor_id: admin, kind: "rejected", text: "رُفض: خارج الميزانية", created_at: r.created_at });
    }
    await trx("request_activities").insert(activities);

    const TASK_STATUS = ["todo", "in_progress", "blocked", "done"];
    await trx("tasks").insert(
      Array.from({ length: 12 }, (_, i) => {
        const created = iso(Date.UTC(2026, 2, 1 + i));
        return {
          organization_id: org, code: `TSK-${String(i + 1).padStart(3, "0")}`, title: `مهمة اختبار رقم ${i + 1}`, description: `وصف المهمة ${i + 1}`,
          status: TASK_STATUS[i % 4], priority: PRIORITY[i % 4], department: DEPT[i % 3], type: "تدريب", assignee_id: jalal, creator_id: admin, project_id: projectOf(i),
          due_date: "2026-07-02", progress: (i % 4) * 25, request_id: i === 0 ? requests[0].id : null,
          completed_at: TASK_STATUS[i % 4] === "done" ? created : null, created_at: created, updated_at: created,
        };
      }),
    );
    await trx("counters").insert([
      { organization_id: org, key: "request", value: 23 },
      { organization_id: org, key: "task", value: 12 },
      { organization_id: org, key: "project", value: 2 },
      { organization_id: org, key: "complaint", value: 913 }, // next code: FCRM-914
    ]);

    // ------------------------------------------------------------ notifications, units, files, reports
    await trx("notifications").insert([
      { organization_id: org, user_id: admin, title: "تقرير جديد", message: "تم رفع تقرير جديد بانتظار المراجعة.", type: "system", is_read: false, created_at: ago(0.003) },
      { organization_id: org, user_id: admin, title: "مهمة بانتظارك", message: "أُسندت إليك مهمة جديدة.", type: "task", is_read: false, link: "/dashboard/tasks/1", created_at: ago(0.002) },
      { organization_id: org, user_id: admin, title: "تنبيه", message: "يرجى مراجعة الطلبات المعلقة.", type: "alert", is_read: true, created_at: ago(0.001) },
    ]);
    await trx("org_units").insert({ organization_id: org, unit_id: 2, enabled: false }); // «العمليات الميدانية» starts switched off

    const folderIds = await trx("folders").insert(
      [{ project_id: alef, name: "التقارير الميدانية" }, { project_id: alef, name: "الوثائق الرسمية" }].map((f) => ({ organization_id: org, ...f })),
      ["id", "name"],
    );
    const folders = Object.fromEntries(folderIds.map((f) => [f.name, f.id]));
    if (storage) {
      const put = async (content) => storage.putBuffer(Buffer.from(content), { folder: `org-${org}/files` });
      const a = await put("%PDF-mock-1");
      const b = await put("xlsx-mock");
      await trx("files").insert([
        { organization_id: org, folder_id: folders["التقارير الميدانية"], name: "تقرير.pdf", size: a.size, mime: "application/pdf", storage_key: a.key, uploaded_by: admin, created_at: "2026-02-01T00:00:00.000Z" },
        { organization_id: org, folder_id: folders["الوثائق الرسمية"], name: "جدول.xlsx", size: b.size, mime: "application/vnd.ms-excel", storage_key: b.key, uploaded_by: admin, created_at: "2026-02-02T00:00:00.000Z" },
      ]);
      const r = await storage.putBuffer(Buffer.from("%PDF-mock-report"), { folder: `org-${org}/reports` });
      await trx("reports").insert({ organization_id: org, project_id: alef, name: "تقرير مالي", type: "مالي", period: "مايو 2026", storage_key: r.key, mime: "application/pdf", file_name: "تقرير مالي.pdf", size: r.size, created_by: admin, created_at: ago(30) });
    }

    // ------------------------------------------------------------ MEAL
    const PROJECT = [alef, baa]; // MEAL data belongs to the same two projects
    const SECTOR = OPTIONS.sectors;
    const REGION = ["غزة", "الضفة"];
    await trx("complaints").insert(
      Array.from({ length: 14 }, (_, i) => ({
        organization_id: org, code: `FCRM-${900 + i}`, type: "تأخير توزيع", project_id: PROJECT[i % 2], region: REGION[i % 2], channel: "الهاتف",
        priority: ["low", "medium", "high", "sensitive"][i % 4], status: ["new", "in_progress", "resolved", "closed"][(i + 1) % 4], owner_id: hala,
        received_at: "2026-02-02", created_at: ago(30), updated_at: ago(30),
      })),
    );
    const indicators = Array.from({ length: 6 }, (_, i) => ({
      organization_id: org, code: `IND-${i + 1}.1`, name: `مؤشر ${i + 1}`, project_id: PROJECT[i % 2], sector: SECTOR[i % 2], target: 100 * (i + 1), achieved: 50 * (i + 1),
      status: indicatorStatus(100 * (i + 1), 50 * (i + 1)), owner_id: salma, created_at: ago(120), updated_at: ago(5),
    }));
    await trx("indicators").insert(indicators);
    const stored = await trx("indicators").where({ organization_id: org }).orderBy("id");
    await trx("indicator_updates").insert(
      stored.flatMap((ind) => [
        { organization_id: org, indicator_id: ind.id, delta: ind.achieved / 2, value_after: ind.achieved / 2, source: "manual", created_by: salma, created_at: ago(100) },
        { organization_id: org, indicator_id: ind.id, delta: ind.achieved / 2, value_after: ind.achieved, source: "manual", created_by: salma, created_at: ago(5) },
      ]),
    );
    await trx("meal_reports").insert(
      ["draft", "in_review", "needs_edit", "approved", "approved"].map((status, i) => ({
        organization_id: org, title: `تقرير ميل ${i + 1}`, type: "تقرير متابعة", project_id: alef, period: "Q1 2026", status, owner_id: dalia, created_at: ago(20 - i), updated_at: ago(20 - i),
      })),
    );
    return { organizationId: org };
  });
}
