// Organization lifecycle:  incomplete --(onboarding submitted)--> pending_approval --(platform admin)--> approved
//                          pending_approval --> rejected     approved --> suspended     rejected|suspended --> approved
// Shared by the HTTP routes and the CLI (scripts/cli.mjs), so a decision made either way behaves identically.
import { ValidationError, HttpError, conflict, notFound } from "../../lib/errors.js";
import { applySearch, hasFilter, pageParams, paginate } from "../../lib/pagination.js";
import { hashPassword } from "../../lib/password.js";
import { iso, nowIso } from "../../lib/time.js";
import { writeAudit } from "../../lib/audit.js";
import { orgDecisionEmail } from "../../lib/mailer.js";
import { notifyOrganization } from "../notifications/service.js";
import { passwordPolicy } from "../auth/schema.js";
import { ORG_STATUSES } from "./schema.js";

const MAX_DOCUMENTS = 20;
const OPS_RESEND_WINDOW_MS = 10 * 60_000;

// authService / limiter are only used by the platform console (absent in the CLI, which never resends codes).
export function createOrganizationService({ db, config, mailer, authService, limiter }) {
  // ---------------------------------------------------------------- onboarding (the organization's own admin)
  async function submitOnboarding(auth, input) {
    return db.transaction(async (trx) => {
      // Atomic compare-and-set: two concurrent submits cannot both win.
      const moved = await trx("organizations")
        .where({ id: auth.organizationId, status: "incomplete" })
        .update({ status: "pending_approval", email: input.email, phone: input.phone, updated_at: nowIso() });
      if (!moved) throw conflict("تم إرسال بيانات المنظمة مسبقاً.");

      const profile = {
        registration_number: input.registration_number,
        country: input.country,
        address: input.address ?? null,
        contact_person_name: input.contact_person_name,
        sectors: JSON.stringify(input.sectors),
        organization_size: input.organization_size ?? null,
        years_of_experience: input.years_of_experience ?? null,
        notes: input.notes ?? null,
        submitted_at: nowIso(),
        updated_at: nowIso(),
      };
      await trx("organization_profiles")
        .insert({ organization_id: auth.organizationId, ...profile })
        .onConflict("organization_id")
        .merge();
    });
  }

  async function storeDocuments(auth, files, storage) {
    const org = await db("organizations").where({ id: auth.organizationId }).first("status");
    if (!["incomplete", "pending_approval"].includes(org?.status)) {
      await Promise.allSettled(files.map((f) => storage.remove(f.key)));
      throw conflict("لا يمكن إضافة وثائق بعد اعتماد المنظمة.");
    }
    const existing = Number((await db("attachments").where({ organization_id: auth.organizationId, attachable_type: "organization" }).count({ n: "*" }).first()).n);
    if (existing + files.length > MAX_DOCUMENTS) {
      await Promise.allSettled(files.map((f) => storage.remove(f.key)));
      throw new ValidationError({ documents: [`الحد الأقصى ${MAX_DOCUMENTS} وثيقة.`] });
    }
    const created_at = nowIso();
    await db("attachments").insert(
      files.map((f) => ({
        organization_id: auth.organizationId,
        attachable_type: "organization",
        attachable_id: auth.organizationId,
        name: f.name,
        size: f.size,
        mime: f.mime,
        storage_key: f.key,
        uploaded_by: auth.userId,
        created_at,
      })),
    );
    return files.length;
  }

  // ---------------------------------------------------------------- platform review
  const summary = (o, admin) => ({
    id: o.id,
    name: o.name,
    type: o.type,
    email: o.email,
    phone: o.phone ?? null,
    region: o.region ?? null,
    status: o.status,
    created_at: iso(o.created_at),
    submitted_at: iso(o.submitted_at),
    approved_at: iso(o.approved_at),
    rejection_reason: o.rejection_reason ?? null,
    admin: admin ? { id: admin.id, name: admin.name, email: admin.email } : null,
  });

  const SUMMARY_COLUMNS = ["o.id", "o.name", "o.type", "o.email", "o.phone", "o.region", "o.status", "o.created_at", "o.approved_at", "o.rejection_reason", "p.submitted_at"];

  /** First system-admin user per organization. */
  async function adminsOf(orgIds) {
    if (!orgIds.length) return new Map();
    const rows = await db("users as u")
      .join("roles as r", "r.id", "u.role_id")
      .whereIn("u.organization_id", orgIds)
      .where("r.is_system_admin", true)
      .orderBy("u.id")
      .select("u.id", "u.name", "u.email", "u.organization_id");
    const map = new Map();
    for (const r of rows) if (!map.has(r.organization_id)) map.set(r.organization_id, r);
    return map;
  }

  /** Employees and beneficiaries reached (submitted MEAL field records) per organization. */
  async function metricsOf(orgIds) {
    const out = new Map(orgIds.map((id) => [Number(id), { employees_count: 0, beneficiaries_reached: 0 }]));
    if (!orgIds.length) return out;
    const [employees, reached] = await Promise.all([
      db("users").whereIn("organization_id", orgIds).groupBy("organization_id").select("organization_id").count({ n: "*" }),
      db("field_records")
        .whereIn("organization_id", orgIds)
        .where({ status: "submitted" })
        .groupBy("organization_id")
        .select("organization_id")
        .sum({ n: "total_beneficiaries" }),
    ]);
    for (const r of employees) out.get(Number(r.organization_id)).employees_count = Number(r.n);
    for (const r of reached) out.get(Number(r.organization_id)).beneficiaries_reached = Number(r.n ?? 0);
    return out;
  }

  /**
   * The verification state of an account, for support. The code itself is never stored (only its keyed hash), so it can
   * never be shown: an operator sees whether one is active, when it was sent / expires and how many wrong guesses it took.
   * Its kind follows from the account's state (see auth/service.js): no password = invitation, unverified = verification,
   * verified = password reset.
   */
  const accountState = (u) => {
    const expires = u.email_otp_expires_at ? new Date(u.email_otp_expires_at) : null;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      verified: Boolean(u.email_verified_at),
      verified_at: iso(u.email_verified_at),
      has_password: Boolean(u.password_hash),
      last_login_at: iso(u.last_login_at),
      code: {
        active: Boolean(u.email_otp_hash) && Boolean(expires) && expires.getTime() > Date.now(),
        kind: !u.password_hash ? "invitation" : u.email_verified_at ? "password_reset" : "verification",
        sent_at: iso(u.email_otp_sent_at),
        expires_at: iso(u.email_otp_expires_at),
        attempts: Number(u.email_otp_attempts ?? 0),
      },
    };
  };

  async function adminAccounts(orgId) {
    const rows = await db("users as u")
      .join("roles as r", "r.id", "u.role_id")
      .where({ "u.organization_id": orgId, "r.is_system_admin": true })
      .orderBy("u.id")
      .select("u.id", "u.name", "u.email", "u.status", "u.password_hash", "u.email_verified_at", "u.last_login_at",
        "u.email_otp_hash", "u.email_otp_expires_at", "u.email_otp_attempts", "u.email_otp_sent_at");
    return rows.map(accountState);
  }

  async function list(query) {
    const qb = db("organizations as o")
      .leftJoin("organization_profiles as p", "p.organization_id", "o.id")
      .select(SUMMARY_COLUMNS)
      .orderBy("o.id", "desc");
    if (hasFilter(query.status)) qb.where("o.status", query.status);
    applySearch(qb, query.search, ["o.name", "o.email"]);
    return paginate(qb, pageParams(query), async (rows) => {
      const ids = rows.map((r) => r.id);
      const [admins, metrics] = await Promise.all([adminsOf(ids), metricsOf(ids)]);
      return rows.map((r) => ({ ...summary(r, admins.get(r.id)), ...metrics.get(Number(r.id)) }));
    });
  }

  async function detail(id) {
    const o = await db("organizations as o").leftJoin("organization_profiles as p", "p.organization_id", "o.id").where("o.id", id).first(...SUMMARY_COLUMNS);
    if (!o) throw notFound("المنظمة غير موجودة.");
    const [p, docs, admins, metrics, accounts] = await Promise.all([
      db("organization_profiles").where({ organization_id: id }).first(),
      db("attachments").where({ organization_id: id, attachable_type: "organization" }).orderBy("id"),
      adminsOf([id]),
      metricsOf([id]),
      adminAccounts(id),
    ]);
    return {
      ...summary(o, admins.get(id)),
      ...metrics.get(Number(id)),
      admin_accounts: accounts,
      profile: p
        ? {
            registration_number: p.registration_number,
            country: p.country,
            address: p.address,
            contact_person_name: p.contact_person_name,
            sectors: JSON.parse(p.sectors || "[]"),
            organization_size: p.organization_size,
            years_of_experience: p.years_of_experience,
            notes: p.notes,
          }
        : null,
      documents: docs.map((d) => ({ id: d.id, name: d.name, size: d.size, mime: d.mime, created_at: iso(d.created_at) })),
    };
  }

  async function document(orgId, docId) {
    const d = await db("attachments").where({ id: docId, organization_id: orgId, attachable_type: "organization" }).first();
    if (!d) throw notFound("الوثيقة غير موجودة.");
    return d;
  }

  /** Atomic status change; distinguishes "no such organization" from "not allowed from this state". */
  async function transition(id, { from, to, set = {}, label }) {
    const changed = await db("organizations").where({ id }).whereIn("status", from).update({ status: to, updated_at: nowIso(), ...set });
    if (changed) return;
    const exists = await db("organizations").where({ id }).first("status");
    if (!exists) throw notFound("المنظمة غير موجودة.");
    throw conflict(`لا يمكن ${label} منظمة حالتها «${exists.status}».`);
  }

  async function adminRecipients(orgId) {
    return db("users as u")
      .join("roles as r", "r.id", "u.role_id")
      .where({ "u.organization_id": orgId, "r.is_system_admin": true, "u.status": "active" })
      .select("u.name", "u.email");
  }

  async function decide(id, kind, { actorId = null, reason = null } = {}) {
    const rules = {
      approve: { from: ["pending_approval", "rejected", "suspended"], to: "approved", label: "اعتماد", set: { approved_at: nowIso(), approved_by: actorId, rejection_reason: null } },
      reject: { from: ["pending_approval"], to: "rejected", label: "رفض", set: { rejection_reason: reason } },
      suspend: { from: ["approved"], to: "suspended", label: "تعليق", set: { rejection_reason: reason } },
    }[kind];
    await transition(id, rules);
    // The operator's decisions are the most consequential actions on the platform: they leave a trace (HTTP console and CLI alike).
    await writeAudit(db, { organizationId: id, actorId, action: `organization.${{ approve: "approved", reject: "rejected", suspend: "suspended" }[kind]}`, entityType: "organization", entityId: id, meta: { reason } });

    const org = await db("organizations").where({ id }).first("name");
    if (kind === "approve") {
      await notifyOrganization(db, id, { title: "تم اعتماد مؤسستك", message: "يمكنك الآن استخدام جميع خدمات منصة مسار.", type: "system", link: "/dashboard" });
    }
    if (kind !== "suspend" || reason) {
      for (const r of await adminRecipients(id)) {
        mailer.sendSafe({ to: r.email, ...orgDecisionEmail({ name: r.name, organizationName: org.name, kind, reason, loginUrl: `${config.FRONTEND_ORIGIN}/login` }) });
      }
    }
    return detail(id);
  }

  /** Platform-wide figures for the operator console. */
  async function stats() {
    const [byStatus, employees, activeEmployees, reached] = await Promise.all([
      db("organizations").groupBy("status").select("status").count({ n: "*" }),
      db("users").whereNotNull("organization_id").count({ n: "*" }).first(),
      db("users").whereNotNull("organization_id").where({ status: "active" }).count({ n: "*" }).first(),
      db("field_records").where({ status: "submitted" }).sum({ n: "total_beneficiaries" }).first(),
    ]);
    const by_status = Object.fromEntries(ORG_STATUSES.map((s) => [s, 0]));
    for (const r of byStatus) by_status[r.status] = Number(r.n);
    return {
      organizations: { total: Object.values(by_status).reduce((a, b) => a + b, 0), by_status },
      employees: { total: Number(employees?.n ?? 0), active: Number(activeEmployees?.n ?? 0) },
      beneficiaries_reached: Number(reached?.n ?? 0),
      // Reaching this line means every query above succeeded.
      health: { status: "ok", database: "ok", uptime_seconds: Math.round(process.uptime()), checked_at: nowIso() },
    };
  }

  /**
   * Re-send the e-mail verification code to an organization's admin who registered but never verified. Same mail, same
   * code rules as the public resend; capped per account so an operator account cannot be used to flood an inbox.
   */
  async function resendAdminVerification(id) {
    const org = await db("organizations").where({ id }).first("name");
    if (!org) throw notFound("المنظمة غير موجودة.");
    const admin = (await adminsOf([id])).get(id);
    if (!admin) throw notFound("لا يوجد مدير نظام لهذه المنظمة.");
    const user = await db("users").where({ id: admin.id }).first("id", "name", "email", "email_verified_at", "password_hash");
    if (user.email_verified_at) throw conflict("البريد الإلكتروني لمدير المنظمة مفعّل مسبقاً.");
    if (!user.password_hash) throw conflict("لم يُنشئ مدير المنظمة كلمة مرور بعد.");
    const key = `ops-resend:${user.id}`;
    try {
      limiter.assert(key, 5 * config.RATE_LIMIT_SCALE, OPS_RESEND_WINDOW_MS);
    } catch {
      throw new HttpError(429, "أُرسلت عدة رموز لهذا الحساب مؤخراً. حاول مجدداً بعد دقائق.");
    }
    limiter.hit(key, OPS_RESEND_WINDOW_MS);
    await authService.sendVerificationCode(user, org.name);
    return detail(id);
  }

  // ---------------------------------------------------------------- platform operators
  async function createPlatformAdmin({ email, name, password }) {
    const clean = String(email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new ValidationError({ email: ["بريد إلكتروني غير صالح."] });
    if (!String(name ?? "").trim()) throw new ValidationError({ name: ["الحقل مطلوب."] });
    const pw = passwordPolicy.safeParse(password);
    if (!pw.success) throw new ValidationError({ password: pw.error.issues.map((i) => i.message) });
    if (await db("users").where({ email: clean }).first("id")) throw new HttpError(409, "هذا البريد مستخدم مسبقاً.");
    const [{ id }] = await db("users").insert(
      {
        organization_id: null,
        role_id: null,
        name: String(name).trim(),
        email: clean,
        password_hash: await hashPassword(password, { logN: config.SCRYPT_LOG_N }),
        status: "active",
        is_platform_admin: true,
        email_verified_at: nowIso(),
      },
      ["id"],
    );
    return { id, email: clean };
  }

  return { submitOnboarding, storeDocuments, list, detail, document, decide, stats, resendAdminVerification, createPlatformAdmin };
}
