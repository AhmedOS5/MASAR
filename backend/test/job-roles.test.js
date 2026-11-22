// Job title -> job category -> default role -> permissions (auto-assignment), the manual override, and its audit trail.
import { afterEach, describe, expect, it } from "vitest";
import { testApp, signedInAdmin, member } from "./helpers.js";
import { ADMIN_ONLY, JOB_CATEGORIES, categoryForTitle, defaultRoleFor } from "../src/modules/people/job-roles.js";
import { PERMISSION_KEYS } from "../src/modules/auth/permissions.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const send = (method, url, payload, headers) => app.inject({ method, url, payload, headers });
const get = (url, headers) => app.inject({ url, headers });
const body = (over = {}) => ({ name: "جلال العمر", email: "jalal@org.org", phone: "0591112222", role_id: "", department: "المالية", status: "active", ...over });
const hire = async (admin, over) => (await send("POST", "/employees", body(over), admin.headers)).json();
const rolePerms = async (roleId) => (await app.db("role_permissions").where({ role_id: roleId })).map((r) => r.permission_key).sort();
const audit = async (admin, id) => (await get(`/employees/${id}/audit`, admin.headers)).json().data;

describe("the catalog (pure, deterministic)", () => {
  it.each([
    ["مدير مالي", "finance"],
    ["محاسب", "finance"],
    ["المحاسبة والمالية", "finance"],
    ["Finance Officer", "finance"],
    ["مدير الموارد البشرية", "manager"],
    ["أخصائي موارد بشرية", "employee"], // HR is not a job category: only the four listed ones exist
    ["HR Coordinator", "employee"],
    ["مسؤول متابعة وتقييم", "meal"],
    ["باحث ميداني", "meal"],
    ["Field Officer", "meal"],
    ["M&E Officer", "meal"],
    ["مدير برامج", "manager"],
    ["المدير التنفيذي", "manager"],
    ["Program Director", "manager"],
    ["سائق", "employee"],
    ["Chris", "employee"],
    ["Headquarters driver", "employee"], // "head" must not match inside another word
  ])("%s -> %s", (title, category) => {
    expect(categoryForTitle(title)).toBe(category);
    expect(categoryForTitle(title)).toBe(category); // same answer every time
  });

  it("no title means no category", () => {
    expect(categoryForTitle("")).toBeNull();
    expect(categoryForTitle("   ")).toBeNull();
    expect(categoryForTitle(null)).toBeNull();
    expect(categoryForTitle(undefined)).toBeNull();
  });

  it("exactly four categories; each package = view permissions + edit permissions, real keys, nothing administrative", () => {
    expect(JOB_CATEGORIES.map((c) => c.key)).toEqual(["manager", "meal", "finance", "employee"]);
    for (const c of JOB_CATEGORIES) {
      expect(c.view.length, c.key).toBeGreaterThan(0);
      expect(c.edit.length, c.key).toBeGreaterThan(0);
      expect(c.permissions, c.key).toEqual([...c.view, ...c.edit]);
      for (const k of c.view) expect(k.endsWith(".view"), `${c.key} view: ${k}`).toBe(true);
      for (const k of c.edit) expect(k.endsWith(".view"), `${c.key} edit: ${k}`).toBe(false);
      for (const k of c.permissions) expect(PERMISSION_KEYS.has(k), `${c.key}: ${k}`).toBe(true);
      for (const k of ADMIN_ONLY) expect(c.permissions, `${c.key} must not hold ${k}`).not.toContain(k);
      // an edit right always comes with the right to see that area (nobody edits what they cannot open)
      for (const k of c.edit) {
        const area = k.split(".")[0];
        expect(c.view, `${c.key}: ${k} without ${area}.view`).toContain(`${area}.view`);
      }
    }
    // finance does not see beneficiaries' personal data; the field/MEAL officer and the manager do
    expect(defaultRoleFor("finance").permissions).not.toContain("beneficiaries.view");
    expect(defaultRoleFor("meal").permissions).toEqual(expect.arrayContaining(["beneficiaries.view", "beneficiaries.edit", "reports.manage"]));
    expect(defaultRoleFor("employee").edit).toEqual(["requests.create", "files.upload"]);
    expect(new Set(JOB_CATEGORIES.map((c) => c.role_title)).size).toBe(JOB_CATEGORIES.length);
    expect(defaultRoleFor("finance").role_title).toBe("مسؤول مالي");
    expect(defaultRoleFor("nope")).toBeUndefined();
  });
});

describe("GET /job-categories", () => {
  it("serves the mapping (key, label, role title, permission keys) to anyone who can view employees", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { data } = (await get("/job-categories", admin.headers)).json();
    expect(data).toHaveLength(JOB_CATEGORIES.length);
    expect(data[0]).toEqual({ key: "manager", label: expect.any(String), role_title: "مدير", view: expect.any(Array), edit: expect.any(Array), permissions: expect.any(Array) });
    expect(JSON.stringify(data)).not.toMatch(/keywords/);
    const none = await member(app, admin);
    expect((await get("/job-categories", none.headers)).statusCode).toBe(403);
  });
});

describe("auto-assignment on create", () => {
  it("a job title picks the category, the default role (created on first use) and its permissions", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { data } = await hire(admin, { job_title: "محاسب" });
    expect(data).toMatchObject({ job_title: "محاسب", job_category: "finance", role: { title: "مسؤول مالي" }, role_source: "auto" });
    expect(await rolePerms(data.role.id)).toEqual([...defaultRoleFor("finance").permissions].sort());
    expect(await audit(admin, data.id)).toEqual([
      expect.objectContaining({ action: "employee.role_auto_assigned", meta: { from: null, to: data.role.id, category: "finance" }, actor: expect.objectContaining({ id: admin.userId }) }),
    ]);
  });

  it("a second employee of the same category reuses the same role", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const a = (await hire(admin, { job_title: "محاسب" })).data;
    const b = (await hire(admin, { job_title: "مدير مالي", email: "b@org.org" })).data;
    expect(b.role.id).toBe(a.role.id);
    expect(Number((await app.db("roles").where({ title: "مسؤول مالي" }).count({ n: "*" }).first()).n)).toBe(1);
  });

  it("an explicit job_category beats the keywords in the title", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { data } = await hire(admin, { job_title: "محاسب", job_category: "meal" });
    expect(data).toMatchObject({ job_category: "meal", role: { title: "مسؤول متابعة وتقييم" }, role_source: "auto" });
  });

  it("an unrecognised title gets the least-privileged default role", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { data } = await hire(admin, { job_title: "سائق" });
    expect(data).toMatchObject({ job_category: "employee", role: { title: "موظف" }, role_source: "auto" });
  });

  it("without a title or category nothing is assigned (as before)", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { data } = await hire(admin, {});
    expect(data).toMatchObject({ job_title: null, job_category: null, role: null, role_source: null });
    expect(await audit(admin, data.id)).toEqual([]);
  });

  it("a role chosen by the admin is 'manual' and the category is only recorded", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const role = (await send("POST", "/roles", { title: "مراجع", permissions: ["requests.view"] }, admin.headers)).json().data;
    const { data } = await hire(admin, { job_title: "محاسب", role_id: role.id });
    expect(data).toMatchObject({ job_category: "finance", role: { id: role.id }, role_source: "manual" });
    expect(await app.db("roles").where({ title: "مسؤول مالي" }).first()).toBeUndefined(); // nothing auto-created
  });

  it("an admin who edited the default role keeps their edit: new hires get the edited role, untouched", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const first = (await hire(admin, { job_title: "محاسب" })).data;
    await send("PUT", `/roles/${first.role.id}`, { permissions: ["requests.view"] }, admin.headers);
    const second = (await hire(admin, { job_title: "محاسب", email: "b@org.org" })).data;
    expect(second.role.id).toBe(first.role.id);
    expect(await rolePerms(first.role.id)).toEqual(["requests.view"]);
  });

  it("never escalates: an actor who lacks the default role's permissions gets no role, and no role is created", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const hr = await member(app, admin, { permissions: ["employees.view", "employees.manage", "requests.view"] });
    const res = await send("POST", "/employees", body({ job_title: "محاسب" }), hr.headers);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ job_category: "finance", role: null, role_source: null });
    expect(await app.db("roles").where({ title: "مسؤول مالي" }).first()).toBeUndefined();
  });

  it("never auto-assigns a system-admin role, even when it carries the default role's title", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    await app.db("roles").where({ is_system_admin: true }).update({ title: "مسؤول مالي" }); // the admin renamed their admin role
    const { data } = await hire(admin, { job_title: "محاسب" });
    expect(data).toMatchObject({ job_category: "finance", role: null, role_source: null });
  });

  it("rejects an unknown job_category", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const res = await send("POST", "/employees", body({ job_category: "ceo" }), admin.headers);
    expect(res.statusCode).toBe(422);
    expect(res.json().errors.job_category).toBeTruthy();
  });

  it("roles are per organization: the other organization gets its own", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const b = await signedInAdmin(app, { admin_email: "boss@other.org", organization_name: "B", organization_email: "x@other.org" });
    const ra = (await hire(a, { job_title: "محاسب" })).data.role.id;
    const rb = (await hire(b, { job_title: "محاسب", email: "other@b.org" })).data.role.id;
    expect(rb).not.toBe(ra);
  });
});

describe("changing the title later", () => {
  it("an auto-assigned role follows the new title (and is logged)", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const e = (await hire(admin, { job_title: "محاسب" })).data;
    const { data } = (await send("PUT", `/employees/${e.id}`, { job_title: "باحث ميداني" }, admin.headers)).json();
    expect(data).toMatchObject({ job_category: "meal", role: { title: "مسؤول متابعة وتقييم" }, role_source: "auto" });
    const log = await audit(admin, e.id);
    expect(log.map((l) => l.action)).toEqual(["employee.role_auto_assigned", "employee.role_auto_assigned"]); // newest first
    expect(log[0].meta).toEqual({ from: e.role.id, to: data.role.id, category: "meal" });
  });

  it("a manual override sticks: it is marked 'manual', logged with from/to, and a later title change leaves it alone", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const e = (await hire(admin, { job_title: "محاسب" })).data;
    const role = (await send("POST", "/roles", { title: "مراجع", permissions: ["requests.view"] }, admin.headers)).json().data;

    const changed = (await send("PUT", `/employees/${e.id}`, { role_id: role.id }, admin.headers)).json().data;
    expect(changed).toMatchObject({ role: { id: role.id }, role_source: "manual" });
    const [entry] = await audit(admin, e.id);
    expect(entry).toMatchObject({ action: "employee.role_changed", meta: { from: e.role.id, to: role.id, previous_source: "auto" }, actor: { id: admin.userId } });

    const later = (await send("PUT", `/employees/${e.id}`, { job_title: "باحث ميداني" }, admin.headers)).json().data;
    expect(later).toMatchObject({ job_category: "meal", role: { id: role.id }, role_source: "manual" });
    expect(await audit(admin, e.id)).toHaveLength(2); // nothing new was logged
  });

  it("re-sending the role the employee already has changes nothing", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const e = (await hire(admin, { job_title: "محاسب" })).data;
    const { data } = (await send("PUT", `/employees/${e.id}`, { role_id: e.role.id, name: "اسم جديد" }, admin.headers)).json();
    expect(data).toMatchObject({ role_source: "auto", name: "اسم جديد" });
    expect(await audit(admin, e.id)).toHaveLength(1);
  });

  it("clearing the role (manual) is logged too and leaves no source", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const e = (await hire(admin, { job_title: "محاسب" })).data;
    const { data } = (await send("PUT", `/employees/${e.id}`, { role_id: "" }, admin.headers)).json();
    expect(data).toMatchObject({ role: null, role_source: null });
    expect((await audit(admin, e.id))[0]).toMatchObject({ action: "employee.role_changed", meta: { from: e.role.id, to: null, previous_source: "auto" } });
  });

  it("an employee who had a role before this feature (no source) is never re-assigned automatically", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const legacy = await member(app, admin, { email: "old@org.org", permissions: ["tasks.view"] });
    const before = (await app.db("users").where({ id: legacy.userId }).first()).role_id;
    const { data } = (await send("PUT", `/employees/${legacy.userId}`, { job_title: "محاسب" }, admin.headers)).json();
    expect(data).toMatchObject({ job_category: "finance", role_source: null });
    expect(data.role.id).toBe(before);
  });

  it("an employee with no role yet is auto-assigned once a title is given", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const e = (await hire(admin, {})).data;
    const { data } = (await send("PUT", `/employees/${e.id}`, { job_title: "محاسب" }, admin.headers)).json();
    expect(data).toMatchObject({ role: { title: "مسؤول مالي" }, role_source: "auto" });
  });
});

describe("the safety rules still hold", () => {
  it("a non-admin still cannot re-role a system admin", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const role = (await send("POST", "/roles", { title: "مراجع", permissions: ["requests.view"] }, admin.headers)).json().data;
    const second = await member(app, admin, { email: "m@org.org", permissions: ["employees.manage"] });
    const res = await send("PUT", `/employees/${admin.userId}`, { role_id: role.id }, second.headers);
    expect(res.statusCode).toBe(403); // not allowed to touch a more powerful user at all
    expect((await app.db("users").where({ id: admin.userId }).first()).role_id).not.toBe(role.id);
  });
});

describe("GET /employees/:id/audit", () => {
  it("needs employees.view and only sees the caller's own organization", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const b = await signedInAdmin(app, { admin_email: "boss@other.org", organization_name: "B", organization_email: "x@other.org" });
    const e = (await hire(a, { job_title: "محاسب" })).data;
    expect((await get(`/employees/${e.id}/audit`, b.headers)).statusCode).toBe(404);
    const none = await member(app, a);
    expect((await get(`/employees/${e.id}/audit`, none.headers)).statusCode).toBe(403);
    expect((await get(`/employees/${e.id}/audit`)).statusCode).toBe(401);
    expect((await get("/employees/abc/audit", a.headers)).statusCode).toBe(404);
  });
});
