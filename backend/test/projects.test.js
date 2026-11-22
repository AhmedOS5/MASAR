// Projects: created by the system admin, a team of employees and supervisors, and the beneficiaries' registry.
import { afterEach, describe, expect, it } from "vitest";
import { testApp, signedInAdmin, member, multipart, PNG } from "./helpers.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const send = (method, url, payload, headers) => app.inject({ method, url, payload, headers });
const get = (url, headers) => app.inject({ url, headers });
const otherOrg = () => signedInAdmin(app, { admin_email: "boss@other.org", organization_name: "B", organization_email: "x@other.org" });
const newProject = async (admin, over = {}) => (await send("POST", "/projects", { name: "مشروع المياه", ...over }, admin.headers)).json().data;
const team = (admin, project, members) => send("PUT", `/projects/${project.id}/members`, { members }, admin.headers);

// the packages as the job-roles catalog defines them (only what these tests need)
const MEAL = ["projects.view", "beneficiaries.view", "beneficiaries.edit", "requests.view", "requests.create"];
const FINANCE = ["projects.view", "requests.view", "requests.approve"];
const VIEWER = ["projects.view", "beneficiaries.view"];

describe("creating and editing projects", () => {
  it("the admin creates a project (code, status, dates) and sees it with its counters", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const res = await send("POST", "/projects", { name: "مشروع المياه", description: "توصيل المياه", start_date: "2026-01-01", end_date: "2026-12-31" }, admin.headers);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ code: "PRJ-001", name: "مشروع المياه", status: "active", start_date: "2026-01-01", end_date: "2026-12-31", my_role: "admin", members_count: 0, beneficiaries_count: 0, members: [] });
    expect((await newProject(admin, { name: "مشروع الصحة" })).code).toBe("PRJ-002");
    expect((await get("/projects", admin.headers)).json().meta.total).toBe(2);
  });

  it("rejects a duplicate name, a missing name and an end date before the start", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    await newProject(admin);
    expect((await send("POST", "/projects", { name: "مشروع المياه" }, admin.headers)).json().errors.name).toBeTruthy();
    expect((await send("POST", "/projects", {}, admin.headers)).statusCode).toBe(422);
    const bad = await send("POST", "/projects", { name: "س", start_date: "2026-05-01", end_date: "2026-04-01" }, admin.headers);
    expect(bad.json().errors.end_date).toBeTruthy();
  });

  it("PUT merges, can complete a project, and keeps the dates in order against what is stored", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const p = await newProject(admin, { start_date: "2026-03-01" });
    const ok = await send("PUT", `/projects/${p.id}`, { status: "completed", description: "تم" }, admin.headers);
    expect(ok.json().data).toMatchObject({ status: "completed", description: "تم", name: "مشروع المياه" });
    const bad = await send("PUT", `/projects/${p.id}`, { end_date: "2026-01-01" }, admin.headers);
    expect(bad.statusCode).toBe(422);
    expect((await send("PUT", `/projects/${p.id}`, { status: "weird" }, admin.headers)).statusCode).toBe(422);
  });

  it("only projects.manage creates or edits; seeing projects needs projects.view", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const p = await newProject(admin);
    const viewer = await member(app, admin, { email: "v@org.org", permissions: VIEWER });
    const none = await member(app, admin, { email: "n@org.org", permissions: [] });
    expect((await send("POST", "/projects", { name: "س" }, viewer.headers)).statusCode).toBe(403);
    expect((await send("PUT", `/projects/${p.id}`, { name: "ص" }, viewer.headers)).statusCode).toBe(403);
    expect((await team(viewer, p, [])).statusCode).toBe(403);
    expect((await get("/projects", none.headers)).statusCode).toBe(403);
    expect((await get("/projects")).statusCode).toBe(401);
  });

  it("projects are per organization", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const b = await otherOrg();
    const p = await newProject(a);
    expect((await get(`/projects/${p.id}`, b.headers)).statusCode).toBe(404);
    expect((await get("/projects", b.headers)).json().meta.total).toBe(0);
    expect((await newProject(b)).code).toBe("PRJ-001"); // its own counter and the same name is free
  });
});

describe("the team: who sees which project", () => {
  it("a member sees only their own projects, with their role; an outsider gets 404", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const p1 = await newProject(admin, { name: "أ" });
    const p2 = await newProject(admin, { name: "ب" });
    const sara = await member(app, admin, { email: "sara@org.org", permissions: MEAL });
    const lead = await member(app, admin, { email: "lead@org.org", permissions: FINANCE });
    expect((await team(admin, p1, [{ user_id: sara.userId, project_role: "member" }, { user_id: lead.userId, project_role: "supervisor" }])).statusCode).toBe(200);

    const mine = (await get("/projects", sara.headers)).json();
    expect(mine.data.map((p) => [p.name, p.my_role])).toEqual([["أ", "member"]]);
    expect((await get("/projects", lead.headers)).json().data[0].my_role).toBe("supervisor");
    expect((await get(`/projects/${p2.id}`, sara.headers)).statusCode).toBe(404);

    const detail = (await get(`/projects/${p1.id}`, sara.headers)).json().data;
    expect(detail.members_count).toBe(2);
    expect(detail.members.map((m) => [m.user_id, m.project_role])).toEqual(expect.arrayContaining([[sara.userId, "member"], [lead.userId, "supervisor"]]));
    expect(JSON.stringify(detail)).not.toMatch(/password|scrypt/);
    expect((await get("/projects", admin.headers)).json().meta.total).toBe(2); // the admin sees all
  });

  it("PUT members replaces the team, validates the users and tells new members", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const p = await newProject(admin);
    const sara = await member(app, admin, { email: "sara@org.org", permissions: MEAL });
    const gone = await member(app, admin, { email: "gone@org.org", permissions: MEAL });
    await app.db("users").where({ id: gone.userId }).update({ status: "inactive" });
    const other = await otherOrg();

    expect((await team(admin, p, [{ user_id: gone.userId }])).json().errors.members).toBeTruthy(); // inactive
    expect((await team(admin, p, [{ user_id: other.userId }])).statusCode).toBe(422); // another organization
    expect((await team(admin, p, [{ user_id: 99999 }])).statusCode).toBe(422);
    expect((await team(admin, p, [{ user_id: sara.userId, project_role: "boss" }])).statusCode).toBe(422);

    await team(admin, p, [{ user_id: sara.userId }, { user_id: sara.userId, project_role: "supervisor" }]); // last entry wins
    expect((await get("/projects", sara.headers)).json().data[0].my_role).toBe("supervisor");
    const notes = (await get("/notifications", sara.headers)).json().data;
    expect(notes.some((n) => n.title === "تمت إضافتك إلى مشروع" && n.message === "مشروع المياه")).toBe(true);

    await team(admin, p, []); // empty team: nobody but the admin
    expect((await get("/projects", sara.headers)).json().meta.total).toBe(0);
  });

  it("a custom role with projects.manage sees and manages every project without being a member", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const p = await newProject(admin);
    const pm = await member(app, admin, { email: "pm@org.org", permissions: ["projects.view", "projects.manage"] });
    expect((await get(`/projects/${p.id}`, pm.headers)).statusCode).toBe(200);
    expect((await send("PUT", `/projects/${p.id}`, { name: "اسم جديد" }, pm.headers)).statusCode).toBe(200);
  });
});

describe("beneficiaries", () => {
  const body = (over = {}) => ({ full_name: "أمل خليل", national_id: "400111222", gender: "female", birth_date: "1990-05-04", phone: "0599000111", region: "غزة", address: "الرمال", household_size: 6, notes: "أسرة من 6 أفراد", ...over });
  async function setup() {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const p = await newProject(admin);
    const field = await member(app, admin, { email: "field@org.org", permissions: MEAL });
    const reader = await member(app, admin, { email: "reader@org.org", permissions: VIEWER });
    const outsider = await member(app, admin, { email: "out@org.org", permissions: MEAL });
    await team(admin, p, [{ user_id: field.userId }, { user_id: reader.userId }]);
    return { admin, p, field, reader, outsider };
  }

  it("a team member with beneficiaries.edit registers a beneficiary (code, status) and it is listed and searchable", async () => {
    const { p, field } = await setup();
    const res = await send("POST", `/projects/${p.id}/beneficiaries`, body(), field.headers);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ code: "BEN-0001", project_id: p.id, full_name: "أمل خليل", national_id: "400111222", gender: "female", household_size: 6, status: "active", attachments: [] });
    await send("POST", `/projects/${p.id}/beneficiaries`, body({ full_name: "سعيد", national_id: "", household_size: "", gender: "" }), field.headers);
    const all = (await get(`/projects/${p.id}/beneficiaries`, field.headers)).json();
    expect(all.meta.total).toBe(2);
    expect((await get(`/projects/${p.id}/beneficiaries?search=400111`, field.headers)).json().data.map((b) => b.full_name)).toEqual(["أمل خليل"]);
    expect((await get(`/projects/${p.id}/beneficiaries?status=inactive`, field.headers)).json().meta.total).toBe(0);
    expect((await get(`/projects/${p.id}`, field.headers)).json().data.beneficiaries_count).toBe(2);
  });

  it("view-only members read but cannot change; outsiders and people without the permission see nothing", async () => {
    const { admin, p, field, reader, outsider } = await setup();
    const b = (await send("POST", `/projects/${p.id}/beneficiaries`, body(), field.headers)).json().data;
    expect((await get(`/projects/${p.id}/beneficiaries`, reader.headers)).json().meta.total).toBe(1);
    expect((await get(`/beneficiaries/${b.id}`, reader.headers)).statusCode).toBe(200);
    expect((await send("POST", `/projects/${p.id}/beneficiaries`, body({ national_id: "1" }), reader.headers)).statusCode).toBe(403);
    expect((await send("PUT", `/beneficiaries/${b.id}`, { full_name: "x" }, reader.headers)).statusCode).toBe(403);
    // not in the team: the project and its people do not exist for them
    expect((await get(`/projects/${p.id}/beneficiaries`, outsider.headers)).statusCode).toBe(404);
    expect((await get(`/beneficiaries/${b.id}`, outsider.headers)).statusCode).toBe(404);
    expect((await send("PUT", `/beneficiaries/${b.id}`, { full_name: "x" }, outsider.headers)).statusCode).toBe(404);
    // finance-like package: sees projects, never personal data
    const finance = await member(app, admin, { email: "fin@org.org", permissions: FINANCE });
    await team(admin, p, [{ user_id: finance.userId }]);
    expect((await get(`/projects/${p.id}/beneficiaries`, finance.headers)).statusCode).toBe(403);
    // another organization
    const other = await otherOrg();
    expect((await get(`/beneficiaries/${b.id}`, other.headers)).statusCode).toBe(404);
  });

  it("validates, refuses a repeated national id in the same project (but not in another) and updates by merge", async () => {
    const { admin, p, field } = await setup();
    const p2 = await newProject(admin, { name: "مشروع ثان" });
    await team(admin, p2, [{ user_id: field.userId }]);
    const b = (await send("POST", `/projects/${p.id}/beneficiaries`, body(), field.headers)).json().data;
    expect((await send("POST", `/projects/${p.id}/beneficiaries`, {}, field.headers)).json().errors.full_name).toBeTruthy();
    expect((await send("POST", `/projects/${p.id}/beneficiaries`, body({ gender: "x" }), field.headers)).statusCode).toBe(422);
    expect((await send("POST", `/projects/${p.id}/beneficiaries`, body(), field.headers)).json().errors.national_id).toBeTruthy();
    expect((await send("POST", `/projects/${p2.id}/beneficiaries`, body(), field.headers)).statusCode).toBe(201);

    const upd = await send("PUT", `/beneficiaries/${b.id}`, { phone: "0599888777", status: "inactive", notes: "" }, field.headers);
    expect(upd.json().data).toMatchObject({ phone: "0599888777", status: "inactive", notes: null, full_name: "أمل خليل", national_id: "400111222" });
    const other = (await send("POST", `/projects/${p.id}/beneficiaries`, body({ national_id: "500" }), field.headers)).json().data;
    expect((await send("PUT", `/beneficiaries/${other.id}`, { national_id: "400111222" }, field.headers)).json().errors.national_id).toBeTruthy();
  });

  it("the beneficiary's file takes documents and images, and is downloadable only inside the team", async () => {
    const { p, field, reader, outsider } = await setup();
    const b = (await send("POST", `/projects/${p.id}/beneficiaries`, body(), field.headers)).json().data;
    const up = multipart([{ name: "file", filename: "photo.png", type: "image/png", content: PNG }]);
    const res = await app.inject({ method: "POST", url: `/beneficiaries/${b.id}/attachments`, payload: up.payload, headers: { ...field.headers, ...up.headers } });
    expect(res.statusCode).toBe(201);
    const att = res.json().data;
    expect(att).toMatchObject({ name: "photo.png", mime: "image/png" });
    expect((await get(`/beneficiaries/${b.id}`, reader.headers)).json().data.attachments).toHaveLength(1);
    expect((await get(`/beneficiaries/${b.id}/attachments/${att.id}/download`, reader.headers)).statusCode).toBe(200);
    expect((await get(`/beneficiaries/${b.id}/attachments/${att.id}/download`, outsider.headers)).statusCode).toBe(404);
    const again = multipart([{ name: "file", filename: "a.png", type: "image/png", content: PNG }]);
    expect((await app.inject({ method: "POST", url: `/beneficiaries/${b.id}/attachments`, payload: again.payload, headers: { ...reader.headers, ...again.headers } })).statusCode).toBe(403);
  });
});
