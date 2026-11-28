// Employees (= the organization's users) and roles.
//
// Safety rules enforced here (an UI can never be trusted to enforce them):
//  * nobody can hand out permissions they do not hold themselves (no privilege escalation through roles.manage /
//    employees.manage); only system admins may touch system-admin roles or users;
//  * an organization always keeps at least one active system admin;
//  * you cannot delete or deactivate your own account.
import { ValidationError, conflict, forbidden, notFound } from "../../lib/errors.js";
import { applySearch, hasFilter, listOf, pageParams, paginate } from "../../lib/pagination.js";
import { bool, iso, nowIso } from "../../lib/time.js";
import { writeAudit } from "../../lib/audit.js";
import { PERMISSIONS, PERMISSION_KEYS } from "../auth/permissions.js";
import { categoryForTitle, defaultRoleFor, publicCatalog } from "./job-roles.js";

const ALL_KEYS = [...PERMISSION_KEYS];
const isSubset = (keys, of) => [...keys].every((k) => of.has(k));
const isUnique = (err) => /unique|duplicate/i.test(String(err?.message));

export function createPeopleService({ db, authService, limiter, config }) {
  // ------------------------------------------------------------------ roles
  /** Map(roleId -> Set(permission keys)); system-admin roles hold every permission. */
  async function permissionSets(roles) {
    const sets = new Map(roles.map((r) => [r.id, new Set()]));
    const ids = roles.filter((r) => !bool(r.is_system_admin)).map((r) => r.id);
    if (ids.length) {
      for (const row of await db("role_permissions").whereIn("role_id", ids)) {
        if (PERMISSION_KEYS.has(row.permission_key)) sets.get(row.role_id).add(row.permission_key);
      }
    }
    for (const r of roles) if (bool(r.is_system_admin)) sets.set(r.id, new Set(ALL_KEYS));
    return sets;
  }

  const toRole = (r, set, usersCount) => ({
    id: r.id,
    title: r.title,
    users_count: usersCount,
    is_system_admin: bool(r.is_system_admin),
    permissions: PERMISSIONS.filter((p) => set.has(p.key)),
  });

  async function findRole(organizationId, id) {
    const r = await db("roles").where({ id, organization_id: organizationId }).first();
    if (!r) throw notFound("الدور غير موجود.");
    return r;
  }

  async function roleView(organizationId, id) {
    const r = await findRole(organizationId, id);
    const [sets, count] = await Promise.all([permissionSets([r]), db("users").where({ organization_id: organizationId, role_id: id }).count({ n: "*" }).first()]);
    return toRole(r, sets.get(id), Number(count.n));
  }

  async function listRoles(auth) {
    const roles = await db("roles").where({ organization_id: auth.organizationId }).orderBy("id");
    const [sets, counts] = await Promise.all([
      permissionSets(roles),
      db("users").where({ organization_id: auth.organizationId }).whereNotNull("role_id").groupBy("role_id").select("role_id").count({ n: "*" }),
    ]);
    const byRole = new Map(counts.map((c) => [c.role_id, Number(c.n)]));
    return listOf(roles.map((r) => toRole(r, sets.get(r.id), byRole.get(r.id) ?? 0)));
  }

  /** Validates keys against the catalog and the "only grant what you hold" rule. Returns a clean Set. */
  function checkGrantable(auth, keys) {
    const unknown = keys.filter((k) => !PERMISSION_KEYS.has(k));
    if (unknown.length) throw new ValidationError({ permissions: [`صلاحيات غير معروفة: ${unknown.join("، ")}`] });
    const set = new Set(keys);
    if (!auth.isSystemAdmin && !isSubset(set, auth.permissions)) {
      throw new ValidationError({ permissions: ["لا يمكنك منح صلاحيات لا تملكها."] });
    }
    return set;
  }

  async function titleTaken(organizationId, title, exceptId = null) {
    const qb = db("roles").where({ organization_id: organizationId }).whereRaw("lower(title) = ?", [title.toLowerCase()]);
    if (exceptId) qb.whereNot({ id: exceptId });
    return Boolean(await qb.first("id"));
  }
  const duplicateTitle = () => new ValidationError({ title: ["يوجد دور بنفس الاسم."] });

  async function createRole(auth, input) {
    const set = checkGrantable(auth, input.permissions);
    if (await titleTaken(auth.organizationId, input.title)) throw duplicateTitle();
    let id;
    try {
      id = await db.transaction(async (trx) => {
        const [{ id: roleId }] = await trx("roles").insert({ organization_id: auth.organizationId, title: input.title, is_system_admin: false }, ["id"]);
        if (set.size) await trx("role_permissions").insert([...set].map((permission_key) => ({ role_id: roleId, permission_key })));
        await writeAudit(trx, {
          organizationId: auth.organizationId, actorId: auth.userId, action: "role.created", entityType: "role", entityId: roleId,
          meta: { title: input.title, permissions: [...set] },
        });
        return roleId;
      });
    } catch (err) {
      if (isUnique(err)) throw duplicateTitle();
      throw err;
    }
    return roleView(auth.organizationId, id);
  }

  async function updateRole(auth, id, input) {
    const role = await findRole(auth.organizationId, id);
    const isAdminRole = bool(role.is_system_admin);
    const current = (await permissionSets([role])).get(id);
    // Only a system admin may edit a role that is more powerful than the actor.
    if (!auth.isSystemAdmin && (isAdminRole || !isSubset(current, auth.permissions))) throw forbidden();

    const title = input.title;
    if (title && title.toLowerCase() !== role.title.toLowerCase() && (await titleTaken(auth.organizationId, title, id))) throw duplicateTitle();

    // A system-admin role always holds every permission: its list cannot be edited, only its title.
    const newSet = !isAdminRole && input.permissions !== undefined ? checkGrantable(auth, input.permissions) : null;
    try {
      await db.transaction(async (trx) => {
        if (title) await trx("roles").where({ id }).update({ title, updated_at: nowIso() });
        if (newSet) {
          await trx("role_permissions").where({ role_id: id }).del();
          if (newSet.size) await trx("role_permissions").insert([...newSet].map((permission_key) => ({ role_id: id, permission_key })));
        }
        await writeAudit(trx, {
          organizationId: auth.organizationId, actorId: auth.userId, action: "role.updated", entityType: "role", entityId: id,
          meta: { title: title ?? role.title, ...(newSet ? { permissions: [...newSet] } : {}) },
        });
      });
    } catch (err) {
      if (isUnique(err)) throw duplicateTitle();
      throw err;
    }
    return roleView(auth.organizationId, id);
  }

  // -------------------------------------------------------------- employees
  const base = (organizationId) =>
    db("users as u").leftJoin("roles as r", "r.id", "u.role_id").where("u.organization_id", organizationId);
  const COLUMNS = ["u.id", "u.name", "u.email", "u.phone", "u.department", "u.job_title", "u.job_category", "u.role_source", "u.status", "u.role_id", "u.password_hash", "u.email_verified_at", "u.created_at", "r.title as role_title", "r.is_system_admin"];

  const toEmployee = (u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role_id ? { id: u.role_id, title: u.role_title } : null,
    // where the role came from: "auto" (derived from the job title), "manual" (an admin chose / changed it), or null
    role_source: u.role_id ? (u.role_source ?? null) : null,
    job_title: u.job_title,
    job_category: u.job_category,
    department: u.department,
    status: u.status,
    // false until the employee has a password and a verified e-mail
    can_login: Boolean(u.password_hash) && Boolean(u.email_verified_at),
    // true until the employee has accepted the invitation (chosen a password on /set-password); an admin can re-send it
    invite_pending: !u.password_hash,
    created_at: iso(u.created_at),
  });

  async function findEmployee(organizationId, id) {
    const u = await base(organizationId).where("u.id", id).first(COLUMNS);
    if (!u) throw notFound("الموظف غير موجود.");
    return u;
  }

  async function listEmployees(auth, query) {
    const qb = base(auth.organizationId).select(COLUMNS).orderBy("u.id");
    if (hasFilter(query.status)) qb.where("u.status", String(query.status));
    if (hasFilter(query.department)) qb.where("u.department", String(query.department));
    if (hasFilter(query.role_id)) {
      const rid = Number(query.role_id);
      if (Number.isInteger(rid)) qb.where("u.role_id", rid);
      else qb.whereRaw("1 = 0");
    }
    applySearch(qb, query.search, ["u.name", "u.email"]);
    if (query.page !== undefined || query.per_page !== undefined) return paginate(qb, pageParams(query), (rows) => rows.map(toEmployee));
    return listOf((await qb.limit(1000)).map(toEmployee));
  }

  /** The role being assigned must exist in this organization and must not exceed the actor's own rights. */
  async function resolveRole(auth, roleId) {
    if (roleId == null) return null;
    const role = await db("roles").where({ id: roleId, organization_id: auth.organizationId }).first();
    if (!role) throw new ValidationError({ role_id: ["الدور المحدد غير موجود."] });
    if (!auth.isSystemAdmin) {
      const set = (await permissionSets([role])).get(role.id);
      if (bool(role.is_system_admin) || !isSubset(set, auth.permissions)) {
        throw new ValidationError({ role_id: ["لا يمكنك إسناد دور يتضمن صلاحيات لا تملكها."] });
      }
    }
    return role;
  }

  /** Non-admins may not modify users who are more powerful than themselves. */
  async function assertCanManage(auth, target) {
    if (auth.isSystemAdmin) return;
    if (bool(target.is_system_admin)) throw forbidden();
    if (target.role_id) {
      const set = (await permissionSets([{ id: target.role_id, is_system_admin: false }])).get(target.role_id);
      if (!isSubset(set, auth.permissions)) throw forbidden();
    }
  }

  const emailTaken = async (address, exceptId = null) => {
    const qb = db("users").where({ email: address });
    if (exceptId) qb.whereNot({ id: exceptId });
    return Boolean(await qb.first("id"));
  };
  const duplicateEmail = () => new ValidationError({ email: ["هذا البريد مستخدم مسبقاً."] });

  /** Active system admins other than `exceptUserId` (an organization must keep at least one). */
  async function otherActiveAdmins(organizationId, exceptUserId) {
    const row = await db("users as u")
      .join("roles as r", "r.id", "u.role_id")
      .where({ "u.organization_id": organizationId, "u.status": "active", "r.is_system_admin": true })
      .whereNot("u.id", exceptUserId)
      .count({ n: "*" })
      .first();
    return Number(row.n);
  }
  const lastAdmin = () => conflict("لا يمكن تنفيذ هذا الإجراء لأنه سيترك المنظمة بلا مدير نظام نشط.");

  // ------------------------------------------------- job category -> default role (see job-roles.js) and the audit trail
  /** Append-only log of who changed what. `handle` is `db` or a transaction. Never put secrets in `meta`. */
  const audit = (handle, auth, action, entityId, meta) =>
    handle("audit_logs").insert({ organization_id: auth.organizationId, actor_id: auth.userId, action, entity_type: "user", entity_id: entityId, meta: JSON.stringify(meta), created_at: nowIso() });

  const findRoleByTitle = (organizationId, title) =>
    db("roles").where({ organization_id: organizationId }).whereRaw("lower(title) = ?", [title.toLowerCase()]).first();

  /**
   * The organization's default role for a job category: the role carrying the catalog's title (created with the
   * catalog's permissions the first time it is needed; if the admin has edited it since, their version is used as is).
   * Returns null — and assigns nothing — when it would hand out more than the actor holds, or when a role of that title is a
   * system-admin role (an automatic assignment can never make someone an admin).
   */
  async function autoRole(auth, categoryKey) {
    const def = defaultRoleFor(categoryKey);
    if (!def) return null;
    let role = await findRoleByTitle(auth.organizationId, def.role_title);
    if (role) {
      if (bool(role.is_system_admin)) return null;
      const set = (await permissionSets([role])).get(role.id);
      return auth.isSystemAdmin || isSubset(set, auth.permissions) ? role : null;
    }
    if (!auth.isSystemAdmin && !isSubset(def.permissions, auth.permissions)) return null;
    try {
      const id = await db.transaction(async (trx) => {
        const [{ id: roleId }] = await trx("roles").insert({ organization_id: auth.organizationId, title: def.role_title, is_system_admin: false }, ["id"]);
        await trx("role_permissions").insert(def.permissions.map((permission_key) => ({ role_id: roleId, permission_key })));
        return roleId;
      });
      return { id, title: def.role_title, is_system_admin: false };
    } catch (err) {
      if (!isUnique(err)) throw err;
      role = await findRoleByTitle(auth.organizationId, def.role_title); // lost a race with a concurrent request
      return role && !bool(role.is_system_admin) ? role : null;
    }
  }

  async function createEmployee(auth, input) {
    const explicitRole = await resolveRole(auth, input.role_id);
    if (await emailTaken(input.email)) throw duplicateEmail();
    // The category is what the admin picked, else what the title says. An explicit role always wins over the mapping.
    const category = input.job_category ?? categoryForTitle(input.job_title);
    const role = explicitRole ?? (category ? await autoRole(auth, category) : null);
    const roleSource = !role ? null : explicitRole ? "manual" : "auto";
    let id;
    try {
      await db.transaction(async (trx) => {
        [{ id }] = await trx("users").insert(
          {
            organization_id: auth.organizationId,
            role_id: role?.id ?? null,
            role_source: roleSource,
            name: input.name,
            email: input.email,
            phone: input.phone ?? null,
            department: input.department ?? null,
            job_title: input.job_title ?? null,
            job_category: category ?? null,
            status: input.status,
            created_at: nowIso(),
            updated_at: nowIso(),
          },
          ["id"],
        );
        if (role) {
          const meta = explicitRole ? { from: null, to: role.id, previous_source: null } : { from: null, to: role.id, category };
          await audit(trx, auth, explicitRole ? "employee.role_changed" : "employee.role_auto_assigned", id, meta);
        }
      });
    } catch (err) {
      if (isUnique(err)) throw duplicateEmail();
      throw err;
    }
    // The new employee has no password: an e-mailed code lets them choose one (inactive ones are invited when activated).
    if (input.status === "active") await authService.sendInvite({ id, email: input.email, name: input.name }, await organizationName(auth.organizationId));
    return toEmployee(await findEmployee(auth.organizationId, id));
  }

  const organizationName = async (organizationId) => (await db("organizations").where({ id: organizationId }).first("name"))?.name ?? "";

  /** Admin action: (re-)send the invitation code to an employee who has not accepted it yet. */
  async function resendInvite(auth, id) {
    const target = await findEmployee(auth.organizationId, id);
    await assertCanManage(auth, target);
    if (target.password_hash) throw conflict("هذا الموظف فعّل حسابه مسبقاً.");
    if (target.status !== "active") throw conflict("فعّل حساب الموظف أولاً ثم أرسل الدعوة.");
    limiter.assert(`invite:${id}`, 5 * config.RATE_LIMIT_SCALE, 10 * 60_000); // not a mail cannon
    limiter.hit(`invite:${id}`, 10 * 60_000);
    await authService.sendInvite({ id, email: target.email, name: target.name }, await organizationName(auth.organizationId));
    return { message: "تم إرسال دعوة جديدة إلى بريد الموظف.", expires_in_hours: config.INVITE_TTL_HOURS };
  }

  async function updateEmployee(auth, id, input) {
    const target = await findEmployee(auth.organizationId, id);
    await assertCanManage(auth, target);

    const patch = {};
    for (const k of ["name", "phone", "department", "status", "job_title"]) if (input[k] !== undefined) patch[k] = input[k];

    // The job category: what the admin picked (null clears it), else what a new title says. Clearing the title keeps it.
    const category = input.job_category !== undefined ? input.job_category : input.job_title ? categoryForTitle(input.job_title) : undefined;
    if (category !== undefined) patch.job_category = category;

    // The role. A role set by hand is final ("manual"): later title changes never touch it. A role that was auto-assigned
    // — or that is still empty — follows the category. Roles from before this feature (no source) are left alone.
    const currentRoleId = target.role_id ?? null;
    let roleAudit = null;
    if (input.role_id !== undefined) {
      const role = await resolveRole(auth, input.role_id);
      patch.role_id = role?.id ?? null;
      if (patch.role_id !== currentRoleId) {
        patch.role_source = patch.role_id ? "manual" : null;
        roleAudit = { action: "employee.role_changed", meta: { from: currentRoleId, to: patch.role_id, previous_source: target.role_source ?? null } };
      }
    } else if (category && category !== target.job_category && (target.role_source === "auto" || (!currentRoleId && !target.role_source))) {
      const role = await autoRole(auth, category);
      if (role && role.id !== currentRoleId) {
        patch.role_id = role.id;
        patch.role_source = "auto";
        roleAudit = { action: "employee.role_auto_assigned", meta: { from: currentRoleId, to: role.id, category } };
      }
    }

    // Safety rules
    const wasActiveAdmin = bool(target.is_system_admin) && target.status === "active";
    const staysActive = (patch.status ?? target.status) === "active";
    const roleIsAdmin = patch.role_id === undefined ? bool(target.is_system_admin) : patch.role_id !== null && bool((await db("roles").where({ id: patch.role_id }).first("is_system_admin"))?.is_system_admin);
    if (target.id === auth.userId && patch.status === "inactive") throw conflict("لا يمكنك إلغاء تفعيل حسابك.");
    if (wasActiveAdmin && (!staysActive || !roleIsAdmin) && (await otherActiveAdmins(auth.organizationId, target.id)) === 0) throw lastAdmin();

    // A new e-mail address must be proven again: unverify, end sessions, mail a verification code — or, for an employee who
    // has not accepted the invitation yet, a fresh invitation (the old code went to the old address).
    const emailChanged = input.email !== undefined && input.email !== target.email;
    if (emailChanged) {
      if (await emailTaken(input.email, id)) throw duplicateEmail();
      patch.email = input.email;
      patch.email_verified_at = null;
    }

    if (Object.keys(patch).length) {
      try {
        await db.transaction(async (trx) => {
          await trx("users").where({ id, organization_id: auth.organizationId }).update({ ...patch, updated_at: nowIso() });
          if (roleAudit) await audit(trx, auth, roleAudit.action, id, roleAudit.meta);
          if (emailChanged) await trx("auth_tokens").where({ user_id: id }).del();
        });
      } catch (err) {
        if (isUnique(err)) throw duplicateEmail();
        throw err;
      }
    }
    // Activating an employee who was added as inactive (no password yet) is the moment they are invited.
    const activated = patch.status === "active" && target.status !== "active";
    if (emailChanged) {
      const who = { id, email: patch.email, name: patch.name ?? target.name };
      if (target.password_hash) await authService.sendVerificationCode(who, await organizationName(auth.organizationId));
      else if ((patch.status ?? target.status) === "active") await authService.sendInvite(who, await organizationName(auth.organizationId));
    } else if (activated && !target.password_hash) {
      await authService.sendInvite({ id, email: target.email, name: patch.name ?? target.name }, await organizationName(auth.organizationId));
    }
    return toEmployee(await findEmployee(auth.organizationId, id));
  }

  async function deleteEmployee(auth, id) {
    const target = await findEmployee(auth.organizationId, id);
    if (target.id === auth.userId) throw conflict("لا يمكنك حذف حسابك.");
    await assertCanManage(auth, target);
    if (bool(target.is_system_admin) && target.status === "active" && (await otherActiveAdmins(auth.organizationId, id)) === 0) throw lastAdmin();
    // Their requests/tasks/comments stay (author becomes "deleted user"); tokens and notifications cascade.
    await db("users").where({ id, organization_id: auth.organizationId }).del();
  }

  /** Role-assignment history of one employee, newest first. 404 for an employee of another organization. */
  async function employeeAudit(auth, id) {
    await findEmployee(auth.organizationId, id);
    const rows = await db("audit_logs as a")
      .leftJoin("users as u", "u.id", "a.actor_id")
      .where({ "a.organization_id": auth.organizationId, "a.entity_type": "user", "a.entity_id": id })
      .orderBy("a.id", "desc")
      .limit(200)
      .select("a.id", "a.action", "a.meta", "a.created_at", "a.actor_id", "u.name as actor_name");
    return listOf(
      rows.map((r) => ({
        id: r.id,
        action: r.action,
        actor: r.actor_id ? { id: r.actor_id, name: r.actor_name } : null,
        meta: JSON.parse(r.meta || "{}"),
        created_at: iso(r.created_at),
      })),
    );
  }

  return {
    listRoles, createRole, updateRole, permissions: () => listOf(PERMISSIONS), jobCategories: () => listOf(publicCatalog()),
    listEmployees, createEmployee, updateEmployee, deleteEmployee, resendInvite, employeeAudit,
  };
}

