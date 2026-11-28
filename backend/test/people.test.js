import { afterEach, describe, expect, it } from "vitest";
import { testApp, signedInAdmin, member, makeProject, login, bearer, PASSWORD } from "./helpers.js";
import { PERMISSIONS } from "../src/modules/auth/permissions.js";
import { hashPassword } from "../src/lib/password.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const get = (url, headers) => app.inject({ url, headers });
const send = (method, url, payload, headers) => app.inject({ method, url, payload, headers });
const otherOrg = () => signedInAdmin(app, { admin_email: "boss@other.org", organization_name: "B", organization_email: "x@other.org" });
const employeeBody = (over = {}) => ({ name: "جلال العمر", email: "jalal@org.org", phone: "0591112222", role_id: "", department: "العمليات", status: "active", ...over });
const hasRows = async (table, where) => Number((await app.db(table).where(where).count({ n: "*" }).first()).n);

/** Make an extra system admin (the admin role flag lives on the role row). */
async function secondAdmin(admin, email = "admin2@org.org") {
  const adminRoleId = (await app.db("users").where({ id: admin.userId }).first()).role_id;
  const [{ id: userId }] = await app.db("users").insert(
    { organization_id: admin.organizationId, role_id: adminRoleId, name: "مدير ٢", email, password_hash: await hashPassword(PASSWORD, { logN: 10 }), email_verified_at: new Date().toISOString() },
    ["id"],
  );
  const res = await login(app, email);
  return { userId, organizationId: admin.organizationId, headers: bearer(res.json().token), adminRoleId };
}

describe("GET /employees", () => {
  it("lists the organization's users with role, status and whether they can log in", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const staff = await member(app, admin, { email: "s@org.org", name: "موظف", permissions: ["tasks.view"] });
    await app.db("users").where({ id: staff.userId }).update({ department: "المالية", status: "inactive" });
    await app.db("users").insert({ organization_id: admin.organizationId, name: "مدعو", email: "invited@org.org" }); // no password yet

    const { data, meta } = (await get("/employees", admin.headers)).json();
    expect(meta.total).toBe(3);
    expect(data.map((e) => e.email)).toEqual(["admin@org.org", "s@org.org", "invited@org.org"]);
    expect(data[0]).toMatchObject({ name: "admin", role: { title: "مدير النظام" }, status: "active", can_login: true, invite_pending: false });
    expect(data[1]).toMatchObject({ role: { title: "role-s@org.org" }, department: "المالية", status: "inactive", can_login: true });
    expect(data[2]).toMatchObject({ role: null, can_login: false, invite_pending: true });
    expect(JSON.stringify(data)).not.toMatch(/password|scrypt/);
  });

  it("filters, paginates on request, and never shows other organizations", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const b = await otherOrg();
    for (let i = 1; i <= 5; i++) await app.db("users").insert({ organization_id: admin.organizationId, name: `موظف ${i}`, email: `e${i}@org.org`, department: i % 2 ? "المالية" : "العمليات", status: i === 5 ? "inactive" : "active" });
    expect((await get("/employees?status=inactive", admin.headers)).json().meta.total).toBe(1);
    expect((await get(`/employees?department=${encodeURIComponent("المالية")}`, admin.headers)).json().meta.total).toBe(3);
    expect((await get("/employees?search=e3@", admin.headers)).json().data).toHaveLength(1);
    expect((await get("/employees?status=all&search=", admin.headers)).json().meta.total).toBe(6);
    expect((await get(`/employees?role_id=${(await app.db("users").first()).role_id}`, admin.headers)).json().meta.total).toBe(1);
    expect((await get("/employees?role_id=abc", admin.headers)).json().meta.total).toBe(0);
    const page = (await get("/employees?per_page=4&page=2", admin.headers)).json();
    expect(page.data).toHaveLength(2);
    expect(page.meta).toMatchObject({ total: 6, last_page: 2, current_page: 2 });
    expect((await get("/employees", b.headers)).json().meta.total).toBe(1);
  });

  it("needs employees.view", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const none = await member(app, admin);
    expect((await get("/employees", none.headers)).statusCode).toBe(403);
    expect((await get("/employees")).statusCode).toBe(401);
  });
});

describe("POST /employees", () => {
  it("creates an active employee without a password (they cannot log in yet)", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const role = (await send("POST", "/roles", { title: "باحث", permissions: ["tasks.view"] }, admin.headers)).json().data;
    const res = await send("POST", "/employees", employeeBody({ role_id: role.id }), admin.headers);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ name: "جلال العمر", email: "jalal@org.org", phone: "0591112222", department: "العمليات", status: "active", role: { id: role.id, title: "باحث" }, can_login: false, invite_pending: true });
    expect((await login(app, "jalal@org.org", PASSWORD)).statusCode).toBe(401);
    expect((await get("/employees", admin.headers)).json().meta.total).toBe(2);
  });

  it("accepts the form's blanks and normalises the e-mail", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const res = await send("POST", "/employees", employeeBody({ email: "  Jalal@ORG.org ", phone: "", department: "", role_id: "", status: "" }), admin.headers);
    expect(res.json().data).toMatchObject({ email: "jalal@org.org", phone: null, department: null, role: null, status: "active" });
  });

  it("422: missing name/e-mail, bad e-mail, duplicate (any case, any organization), unknown or foreign role, bad status", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const b = await otherOrg();
    const foreignRole = (await send("POST", "/roles", { title: "x" }, b.headers)).json().data;
    expect((await send("POST", "/employees", {}, admin.headers)).json().errors).toHaveProperty("name");
    for (const [over, field] of [[{ email: "nope" }, "email"], [{ email: "ADMIN@org.org" }, "email"], [{ email: "boss@other.org" }, "email"], [{ role_id: 9999 }, "role_id"], [{ role_id: foreignRole.id }, "role_id"], [{ status: "fired" }, "status"], [{ name: " " }, "name"]]) {
      const r = await send("POST", "/employees", employeeBody(over), admin.headers);
      expect(r.statusCode, JSON.stringify(over)).toBe(422);
      expect(r.json().errors[field], field).toBeTruthy();
    }
    expect((await get("/employees", admin.headers)).json().meta.total).toBe(1);
  });

  it("ignores fields that would grant access (organization, platform admin, password, verification)", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const b = await otherOrg();
    await send("POST", "/employees", employeeBody({ organization_id: b.organizationId, is_platform_admin: true, password_hash: "x", admin_password: "Passw0rd!", email_verified_at: "2020-01-01" }), admin.headers);
    const u = await app.db("users").where({ email: "jalal@org.org" }).first();
    expect(u).toMatchObject({ organization_id: admin.organizationId, password_hash: null, email_verified_at: null });
    expect(Boolean(u.is_platform_admin)).toBe(false);
  });

  it("needs employees.manage", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const viewer = await member(app, admin, { permissions: ["employees.view"] });
    expect((await send("POST", "/employees", employeeBody(), viewer.headers)).statusCode).toBe(403);
    expect((await send("POST", "/employees", employeeBody())).statusCode).toBe(401);
  });
});

describe("PUT /employees/:id", () => {
  async function created(admin, over) {
    return (await send("POST", "/employees", employeeBody(over), admin.headers)).json().data;
  }

  it("applies the edit form payload; blank role/phone/department clear them; absent fields stay", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const role = (await send("POST", "/roles", { title: "باحث" }, admin.headers)).json().data;
    const e = await created(admin, { role_id: role.id });
    const res = await send("PUT", `/employees/${e.id}`, { name: "اسم جديد", email: e.email, phone: "", role_id: "", department: "", status: "inactive" }, admin.headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ name: "اسم جديد", phone: null, role: null, department: null, status: "inactive", email: "jalal@org.org" });
    const merged = await send("PUT", `/employees/${e.id}`, { department: "المالية" }, admin.headers);
    expect(merged.json().data).toMatchObject({ name: "اسم جديد", department: "المالية", status: "inactive" });
  });

  it("a changed e-mail must be re-verified: sessions end, a code is mailed, login is blocked until verified", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const staff = await member(app, admin, { email: "s@org.org", name: "S" });
    const before = app.mailer.outbox.length;
    const res = await send("PUT", `/employees/${staff.userId}`, { email: "S-new@org.org" }, admin.headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ email: "s-new@org.org", can_login: false });
    expect((await get("/auth/me", staff.headers)).statusCode).toBe(401);
    expect(app.mailer.outbox).toHaveLength(before + 1);
    expect(app.mailer.outbox.at(-1).to).toBe("s-new@org.org");
    expect((await login(app, "s-new@org.org")).statusCode).toBe(403);
    // an employee who has no password yet is re-INVITED at the new address (the old invitation went to the old one)
    const e = await created(admin);
    const mails = app.mailer.outbox.length;
    await send("PUT", `/employees/${e.id}`, { email: "other@org.org" }, admin.headers);
    expect(app.mailer.outbox).toHaveLength(mails + 1);
    expect(app.mailer.outbox.at(-1)).toMatchObject({ to: "other@org.org" });
    expect(app.mailer.outbox.at(-1).subject).toMatch(/دعوة/);
  });

  it("422 for a duplicate e-mail or foreign role; keeping your own e-mail is fine; 404 across organizations", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const b = await otherOrg();
    const e = await created(admin);
    expect((await send("PUT", `/employees/${e.id}`, { email: "admin@org.org" }, admin.headers)).json().errors.email).toBeTruthy();
    expect((await send("PUT", `/employees/${e.id}`, { email: "jalal@org.org" }, admin.headers)).statusCode).toBe(200);
    expect((await send("PUT", `/employees/${e.id}`, { role_id: 9999 }, admin.headers)).json().errors.role_id).toBeTruthy();
    expect((await send("PUT", `/employees/${e.id}`, { name: "x" }, b.headers)).statusCode).toBe(404);
    expect((await send("PUT", "/employees/abc", { name: "x" }, admin.headers)).statusCode).toBe(404);
  });

  it("you cannot deactivate yourself; the last active system admin cannot be demoted or deactivated", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const normal = (await send("POST", "/roles", { title: "عادي" }, admin.headers)).json().data;
    expect((await send("PUT", `/employees/${admin.userId}`, { status: "inactive" }, admin.headers)).statusCode).toBe(409);
    expect((await send("PUT", `/employees/${admin.userId}`, { role_id: normal.id }, admin.headers)).statusCode).toBe(409); // only admin
    expect((await send("PUT", `/employees/${admin.userId}`, { role_id: "" }, admin.headers)).statusCode).toBe(409);

    const second = await secondAdmin(admin);
    expect((await send("PUT", `/employees/${second.userId}`, { status: "inactive" }, admin.headers)).statusCode).toBe(200); // admin remains
    expect((await send("PUT", `/employees/${second.userId}`, { status: "active" }, admin.headers)).statusCode).toBe(200);
    expect((await send("PUT", `/employees/${second.userId}`, { role_id: normal.id }, admin.headers)).statusCode).toBe(200); // demote B: A remains
    expect((await send("PUT", `/employees/${admin.userId}`, { role_id: normal.id }, admin.headers)).statusCode).toBe(409); // A would be the last
  });

  it("without system-admin rights you cannot edit admins or people more powerful than you", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const hr = await member(app, admin, { email: "hr@org.org", name: "HR", permissions: ["employees.view", "employees.manage", "roles.view", "tasks.view"] });
    const boss = await member(app, admin, { email: "boss2@org.org", name: "رئيس", permissions: ["employees.view", "employees.manage", "requests.approve", "tasks.view"] });
    const junior = await member(app, admin, { email: "j@org.org", name: "J", permissions: ["tasks.view"] });
    const juniorRole = (await app.db("users").where({ id: junior.userId }).first()).role_id;
    const bossRole = (await app.db("users").where({ id: boss.userId }).first()).role_id;
    const adminRole = (await app.db("users").where({ id: admin.userId }).first()).role_id;

    expect((await send("PUT", `/employees/${admin.userId}`, { name: "hacked" }, hr.headers)).statusCode).toBe(403);
    expect((await send("PUT", `/employees/${boss.userId}`, { name: "hacked" }, hr.headers)).statusCode).toBe(403); // holds requests.approve, HR does not
    expect((await send("DELETE", `/employees/${admin.userId}`, undefined, hr.headers)).statusCode).toBe(403);
    expect((await send("PUT", `/employees/${junior.userId}`, { name: "ok" }, hr.headers)).statusCode).toBe(200);

    // assigning roles: only roles whose permissions HR itself holds
    expect((await send("PUT", `/employees/${junior.userId}`, { role_id: adminRole }, hr.headers)).json().errors.role_id).toBeTruthy();
    expect((await send("PUT", `/employees/${junior.userId}`, { role_id: bossRole }, hr.headers)).json().errors.role_id).toBeTruthy();
    expect((await send("PUT", `/employees/${junior.userId}`, { role_id: juniorRole }, hr.headers)).statusCode).toBe(200);
    expect((await send("POST", "/employees", employeeBody({ role_id: adminRole }), hr.headers)).statusCode).toBe(422);
    expect((await send("PUT", `/employees/${hr.userId}`, { role_id: adminRole }, hr.headers)).statusCode).toBe(422); // no self-promotion
    expect((await app.db("users").where({ id: admin.userId }).first()).name).toBe("admin");
  });
});

describe("DELETE /employees/:id", () => {
  it("removes the employee (204), keeps their work, ends their sessions", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const staff = await member(app, admin, { email: "s@org.org", name: "راحل", permissions: ["requests.view", "requests.create", "tasks.view"] });
    const project = await makeProject(app, admin, [{ user: staff }]);
    const req = (await send("POST", "/requests", { title: "طلب الراحل", type: "t", project_id: project }, staff.headers)).json().data;
    await app.db("tasks").insert({ organization_id: admin.organizationId, project_id: project, code: "TSK-001", title: "t", assignee_id: staff.userId });

    const res = await send("DELETE", `/employees/${staff.userId}`, undefined, admin.headers);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect(await hasRows("users", { id: staff.userId })).toBe(0);
    expect(await hasRows("auth_tokens", { user_id: staff.userId })).toBe(0);
    expect((await app.db("tasks").first()).assignee_id).toBeNull();
    expect((await get(`/requests/${req.id}`, admin.headers)).json().data.requester.name).toBe("مستخدم محذوف");
    expect((await get("/auth/me", staff.headers)).statusCode).toBe(401);
  });

  it("cannot delete yourself, the last admin, other organizations' users; 404 for unknown", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const b = await otherOrg();
    expect((await send("DELETE", `/employees/${admin.userId}`, undefined, admin.headers)).statusCode).toBe(409);
    const second = await secondAdmin(admin);
    expect((await send("DELETE", `/employees/${second.userId}`, undefined, admin.headers)).statusCode).toBe(204); // A remains
    expect((await send("DELETE", `/employees/${b.userId}`, undefined, admin.headers)).statusCode).toBe(404);
    expect((await send("DELETE", "/employees/9999", undefined, admin.headers)).statusCode).toBe(404);
    expect(await hasRows("users", { id: b.userId })).toBe(1);
  });

  it("the last active admin is protected even when another admin is inactive", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const second = await secondAdmin(admin);
    await app.db("users").where({ id: admin.userId }).update({ status: "inactive" }); // A deactivated directly in the DB
    // second (acting) is now the only active admin; a non-admin manager cannot remove them
    const hr = await member(app, { organizationId: admin.organizationId }, { email: "hr@org.org", permissions: ["employees.manage"] });
    expect((await send("DELETE", `/employees/${second.userId}`, undefined, hr.headers)).statusCode).toBe(403);
    expect(await hasRows("users", { id: second.userId })).toBe(1);
  });

  it("needs employees.manage", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const viewer = await member(app, admin, { permissions: ["employees.view"] });
    expect((await send("DELETE", `/employees/${admin.userId}`, undefined, viewer.headers)).statusCode).toBe(403);
  });
});

describe("roles and permissions", () => {
  it("GET /permissions returns the catalog; GET /roles shows the admin role with every permission", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const perms = (await get("/permissions", admin.headers)).json();
    expect(perms.data).toHaveLength(PERMISSIONS.length);
    expect(perms.data[0]).toEqual({ key: "requests.view", label: expect.any(String) });

    const { data } = (await get("/roles", admin.headers)).json();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ title: "مدير النظام", is_system_admin: true, users_count: 1 });
    expect(data[0].permissions).toHaveLength(PERMISSIONS.length);
    expect(data[0].permissions[0]).toEqual({ key: "requests.view", label: expect.any(String) });
  });

  it("role changes are audited (who, which role, which permissions)", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const id = (await send("POST", "/roles", { title: "مدقق", permissions: ["tasks.view"] }, admin.headers)).json().data.id;
    expect((await send("PUT", `/roles/${id}`, { title: "مدقق أول", permissions: ["tasks.view", "reports.view"] }, admin.headers)).statusCode).toBe(200);
    const rows = await app.db("audit_logs").where({ entity_type: "role", entity_id: id }).orderBy("id");
    expect(rows.map((r) => r.action)).toEqual(["role.created", "role.updated"]);
    expect(rows.every((r) => r.actor_id === admin.userId && r.organization_id === admin.organizationId)).toBe(true);
    const meta = rows.map((r) => (typeof r.meta === "string" ? JSON.parse(r.meta) : r.meta));
    expect(meta[0]).toMatchObject({ title: "مدقق", permissions: ["tasks.view"] });
    expect(meta[1].title).toBe("مدقق أول");
    expect([...meta[1].permissions].sort()).toEqual(["reports.view", "tasks.view"]);
  });

  it("creates a role (permissions de-duplicated, ordered by the catalog) and counts its users", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const res = await send("POST", "/roles", { title: "  مدير عمليات ", permissions: ["reports.view", "tasks.view", "tasks.view"] }, admin.headers);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ title: "مدير عمليات", users_count: 0, is_system_admin: false });
    expect(res.json().data.permissions.map((p) => p.key)).toEqual(["tasks.view", "reports.view"]);

    const id = res.json().data.id;
    await send("POST", "/employees", employeeBody({ role_id: id }), admin.headers);
    expect((await get("/roles", admin.headers)).json().data.find((r) => r.id === id).users_count).toBe(1);
    expect((await send("POST", "/roles", { title: "فارغ" }, admin.headers)).json().data.permissions).toEqual([]);
  });

  it("422: title required, duplicate title (any case, same org only), unknown permission keys", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const b = await otherOrg();
    await send("POST", "/roles", { title: "Analyst" }, b.headers); // same title in another org is fine
    expect((await send("POST", "/roles", { title: "Analyst" }, admin.headers)).statusCode).toBe(201);
    expect((await send("POST", "/roles", { title: "analyst" }, admin.headers)).json().errors.title).toBeTruthy();
    expect((await send("POST", "/roles", { title: "مدير النظام" }, admin.headers)).json().errors.title).toBeTruthy();
    expect((await send("POST", "/roles", {}, admin.headers)).json().errors.title).toBeTruthy();
    const unknown = await send("POST", "/roles", { title: "x", permissions: ["tasks.view", "root.everything"] }, admin.headers);
    expect(unknown.statusCode).toBe(422);
    expect(unknown.json().errors.permissions[0]).toContain("root.everything");
    expect((await send("POST", "/roles", { title: "x", permissions: "tasks.view" }, admin.headers)).statusCode).toBe(422);
  });

  it("updates title and permissions (merge); keeping the same title is fine; unknown keys / duplicates are 422", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const a = (await send("POST", "/roles", { title: "A", permissions: ["tasks.view"] }, admin.headers)).json().data;
    await send("POST", "/roles", { title: "B" }, admin.headers);
    const res = await send("PUT", `/roles/${a.id}`, { title: "A", permissions: ["reports.view", "files.view"] }, admin.headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.permissions.map((p) => p.key)).toEqual(["files.view", "reports.view"]);
    expect((await send("PUT", `/roles/${a.id}`, { title: "A2" }, admin.headers)).json().data.permissions).toHaveLength(2); // permissions untouched
    expect((await send("PUT", `/roles/${a.id}`, { permissions: [] }, admin.headers)).json().data.permissions).toEqual([]);
    expect((await send("PUT", `/roles/${a.id}`, { title: "b" }, admin.headers)).json().errors.title).toBeTruthy();
    expect((await send("PUT", `/roles/${a.id}`, { permissions: ["nope"] }, admin.headers)).statusCode).toBe(422);
    expect((await send("PUT", "/roles/9999", { title: "x" }, admin.headers)).statusCode).toBe(404);
  });

  it("the system-admin role keeps every permission whatever is sent", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const adminRole = (await get("/roles", admin.headers)).json().data[0];
    const res = await send("PUT", `/roles/${adminRole.id}`, { title: "المدير العام", permissions: ["tasks.view"] }, admin.headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ title: "المدير العام", is_system_admin: true });
    expect(res.json().data.permissions).toHaveLength(PERMISSIONS.length);
    expect((await get("/permissions", admin.headers)).statusCode).toBe(200);
    const project = await makeProject(app, admin);
    expect((await send("POST", "/requests", { title: "t", type: "x", project_id: project }, admin.headers)).statusCode).toBe(201); // still all-powerful
  });

  it("nobody can grant permissions they do not hold, or edit roles above them", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const mgr = await member(app, admin, { email: "rm@org.org", permissions: ["roles.view", "roles.manage", "tasks.view", "tasks.create"] });
    const adminRole = (await get("/roles", admin.headers)).json().data[0];
    const powerful = (await send("POST", "/roles", { title: "قوي", permissions: ["requests.approve", "tasks.view"] }, admin.headers)).json().data;

    const escalate = await send("POST", "/roles", { title: "ترقية", permissions: ["tasks.view", "requests.approve"] }, mgr.headers);
    expect(escalate.statusCode).toBe(422);
    expect(escalate.json().errors.permissions).toBeTruthy();
    expect((await send("POST", "/roles", { title: "مسموح", permissions: ["tasks.view", "tasks.create"] }, mgr.headers)).statusCode).toBe(201);

    expect((await send("PUT", `/roles/${adminRole.id}`, { title: "x" }, mgr.headers)).statusCode).toBe(403);
    expect((await send("PUT", `/roles/${powerful.id}`, { title: "x" }, mgr.headers)).statusCode).toBe(403); // holds requests.approve
    const own = (await send("POST", "/roles", { title: "ضمن الصلاحيات", permissions: ["tasks.view"] }, mgr.headers)).json().data;
    expect((await send("PUT", `/roles/${own.id}`, { permissions: ["tasks.view", "roles.manage"] }, mgr.headers)).statusCode).toBe(200);
    expect((await send("PUT", `/roles/${own.id}`, { permissions: ["files.upload"] }, mgr.headers)).statusCode).toBe(422);
  });

  it("is organization-scoped and permission-guarded", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const b = await otherOrg();
    const role = (await send("POST", "/roles", { title: "A" }, admin.headers)).json().data;
    expect((await get("/roles", b.headers)).json().data.map((r) => r.title)).toEqual(["مدير النظام"]);
    expect((await send("PUT", `/roles/${role.id}`, { title: "x" }, b.headers)).statusCode).toBe(404);
    const viewer = await member(app, admin, { permissions: ["roles.view"] });
    expect((await get("/roles", viewer.headers)).statusCode).toBe(200);
    expect((await send("POST", "/roles", { title: "n" }, viewer.headers)).statusCode).toBe(403);
    const none = await member(app, admin, { email: "n@org.org" });
    expect((await get("/roles", none.headers)).statusCode).toBe(403);
    expect((await get("/permissions", none.headers)).statusCode).toBe(403);
    expect((await get("/roles")).statusCode).toBe(401);
  });

  it("a role change takes effect on the next request (no stale permissions)", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const staff = await member(app, admin, { email: "s@org.org", permissions: ["tasks.view"] });
    expect((await get("/requests", staff.headers)).statusCode).toBe(403);
    const roleId = (await app.db("users").where({ id: staff.userId }).first()).role_id;
    await send("PUT", `/roles/${roleId}`, { permissions: ["tasks.view", "requests.view"] }, admin.headers);
    expect((await get("/requests", staff.headers)).statusCode).toBe(200);
  });
});
