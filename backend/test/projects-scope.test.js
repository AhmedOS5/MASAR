// Requests, tasks, folders, files, reports and the select lists inside projects: capability comes from the package,
// reach from membership. A project is mandatory: there is no organization-wide work.
import { afterEach, describe, expect, it } from "vitest";
import { testApp, signedInAdmin, member, multipart, PDF, PNG } from "./helpers.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const send = (method, url, payload, headers) => app.inject({ method, url, payload, headers });
const get = (url, headers) => app.inject({ url, headers });
const upload = (url, headers, parts) => {
  const m = multipart(parts);
  return app.inject({ method: "POST", url, payload: m.payload, headers: { ...headers, ...m.headers } });
};

const WORKER = ["projects.view", "requests.view", "requests.create", "tasks.view", "tasks.create", "files.view", "files.upload", "reports.view", "reports.manage"];
const APPROVER = ["projects.view", "requests.view", "requests.approve", "tasks.view", "tasks.create", "tasks.update"];

/** An organization with two projects: A (sara = member, lead = supervisor) and B (nobody but the admin). */
async function world() {
  app = await testApp();
  const admin = await signedInAdmin(app);
  const A = (await send("POST", "/projects", { name: "مشروع أ" }, admin.headers)).json().data;
  const B = (await send("POST", "/projects", { name: "مشروع ب" }, admin.headers)).json().data;
  const sara = await member(app, admin, { email: "sara@org.org", name: "سارة", permissions: WORKER });
  const lead = await member(app, admin, { email: "lead@org.org", name: "المشرف", permissions: APPROVER });
  await send("PUT", `/projects/${A.id}/members`, { members: [{ user_id: sara.userId }, { user_id: lead.userId, project_role: "supervisor" }] }, admin.headers);
  return { admin, A, B, sara, lead };
}
const request = async (who, over = {}) => (await send("POST", "/requests", { title: "طلب", type: "مشتريات", ...over }, who.headers)).json();

describe("requests", () => {
  it("a request is created inside a project the person works in, and says which", async () => {
    const { A, sara } = await world();
    const res = await send("POST", "/requests", { title: "طلب مياه", type: "مشتريات", project_id: A.id }, sara.headers);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ project_id: A.id, project: { id: A.id, name: "مشروع أ" } });
  });

  it("422 for no project, a project that does not exist or one that the person is not part of", async () => {
    const { B, sara } = await world();
    expect((await send("POST", "/requests", { title: "x", type: "y", project_id: B.id }, sara.headers)).json().errors.project_id).toBeTruthy();
    expect((await send("POST", "/requests", { title: "x", type: "y", project_id: 9999 }, sara.headers)).statusCode).toBe(422);
    expect((await send("POST", "/requests", { title: "x", type: "y" }, sara.headers)).json().errors.project_id).toEqual(["الحقل مطلوب."]);
  });

  it("outsiders do not see a project's requests (lists, detail, comments, attachments); admins and the team do", async () => {
    const { admin, A, B, sara, lead } = await world();
    const mine = (await request(sara, { project_id: A.id, title: "في أ" })).data;
    const theirs = (await request(admin, { project_id: B.id, title: "في ب" })).data;

    const titles = async (who, qs = "") => (await get(`/requests${qs}`, who.headers)).json().data.map((r) => r.title).sort();
    expect(await titles(sara)).toEqual(["في أ"]); // not "في ب"
    expect(await titles(lead)).toEqual(["في أ"]);
    expect(await titles(admin)).toEqual(["في أ", "في ب"]);
    expect(await titles(admin, `?project_id=${B.id}`)).toEqual(["في ب"]);
    expect((await get(`/requests?project_id=${B.id}`, sara.headers)).json().meta.total).toBe(0);

    expect((await get(`/requests/${theirs.id}`, sara.headers)).statusCode).toBe(404);
    expect((await send("POST", `/requests/${theirs.id}/comments`, { body: "x" }, sara.headers)).statusCode).toBe(404);
    expect((await upload(`/requests/${theirs.id}/attachments`, sara.headers, [{ name: "file", filename: "a.pdf", type: "application/pdf", content: PDF }])).statusCode).toBe(404);
    expect((await get(`/requests/${mine.id}`, sara.headers)).statusCode).toBe(200);
  });

  it("only a supervisor (or the admin) approves a project's request; a plain member with the permission is refused", async () => {
    const { admin, A, sara, lead } = await world();
    const memberWithApprove = await member(app, admin, { email: "m2@org.org", permissions: [...WORKER, "requests.approve"] });
    await send("PUT", `/projects/${A.id}/members`, { members: [{ user_id: sara.userId }, { user_id: lead.userId, project_role: "supervisor" }, { user_id: memberWithApprove.userId }] }, admin.headers);
    const r1 = (await request(sara, { project_id: A.id })).data;
    const r2 = (await request(sara, { project_id: A.id })).data;
    expect((await send("POST", `/requests/${r1.id}/approve`, {}, memberWithApprove.headers)).statusCode).toBe(403);
    expect((await send("POST", `/requests/${r1.id}/approve`, {}, lead.headers)).statusCode).toBe(200);
    expect((await send("POST", `/requests/${r2.id}/reject`, { reason: "لا" }, lead.headers)).json().data.status).toBe("rejected");
    // the system admin may decide it too (as long as it is not their own request)
    const r3 = (await request(sara, { project_id: A.id })).data;
    expect((await send("POST", `/requests/${r3.id}/approve`, {}, admin.headers)).statusCode).toBe(200);
  });

  it("a task made from a project's request stays in that project", async () => {
    const { A, sara, lead } = await world();
    const r = (await request(sara, { project_id: A.id })).data;
    await send("POST", `/requests/${r.id}/approve`, {}, lead.headers);
    const t = await send("POST", `/requests/${r.id}/tasks`, {}, lead.headers);
    expect(t.statusCode).toBe(201);
    expect(t.json().data.project).toMatchObject({ id: A.id });
  });
});

describe("tasks", () => {
  it("a task lives in a project, can only be given to someone on its team, and is hidden from everyone else", async () => {
    const { admin, A, B, sara, lead } = await world();
    const outsider = await member(app, admin, { email: "out@org.org", permissions: WORKER });
    const made = await send("POST", "/tasks", { title: "مهمة", project_id: A.id, assignee_id: sara.userId }, lead.headers);
    expect(made.statusCode).toBe(201);
    expect(made.json().data).toMatchObject({ project: { id: A.id, name: "مشروع أ" }, assignee_id: sara.userId });

    expect((await send("POST", "/tasks", { title: "x", project_id: A.id, assignee_id: outsider.userId }, lead.headers)).json().errors.assignee_id).toBeTruthy();
    expect((await send("POST", "/tasks", { title: "x", project_id: B.id }, lead.headers)).json().errors.project_id).toBeTruthy();

    const id = made.json().data.id;
    expect((await get(`/tasks/${id}`, outsider.headers)).statusCode).toBe(404);
    expect((await get("/tasks", outsider.headers)).json().meta.total).toBe(0);
    expect((await get("/tasks", sara.headers)).json().meta.total).toBe(1);
    expect((await get(`/tasks?project_id=${A.id}`, admin.headers)).json().meta.total).toBe(1);
    expect((await send("PATCH", `/tasks/${id}`, { status: "done" }, outsider.headers)).statusCode).toBe(404);
  });

  it("the assignee reports progress; only a supervisor edits the rest of a project's task", async () => {
    const { admin, A, sara, lead } = await world();
    const peer = await member(app, admin, { email: "peer@org.org", permissions: [...WORKER, "tasks.update"] });
    await send("PUT", `/projects/${A.id}/members`, { members: [{ user_id: sara.userId }, { user_id: peer.userId }, { user_id: lead.userId, project_role: "supervisor" }] }, admin.headers);
    const t = (await send("POST", "/tasks", { title: "مهمة", project_id: A.id, assignee_id: sara.userId }, lead.headers)).json().data;
    expect((await send("PATCH", `/tasks/${t.id}`, { progress: 40 }, sara.headers)).json().data.progress).toBe(40);
    expect((await send("PATCH", `/tasks/${t.id}`, { title: "غيرت" }, sara.headers)).statusCode).toBe(403);
    // a member holding tasks.update still cannot direct someone else's task inside a project
    expect((await send("PATCH", `/tasks/${t.id}`, { title: "غيرت" }, peer.headers)).statusCode).toBe(403);
    expect((await send("PATCH", `/tasks/${t.id}`, { title: "عدّلها المشرف" }, lead.headers)).json().data.title).toBe("عدّلها المشرف");
  });
});

describe("the dashboard", () => {
  it("lists and counters only include what the caller may reach", async () => {
    const { admin, B, sara } = await world();
    await request(admin, { project_id: B.id, title: "سري" });
    await send("POST", "/tasks", { title: "مهمة سرية", project_id: B.id }, admin.headers);
    const d = (await get("/dashboard/summary", sara.headers)).json().data;
    expect(JSON.stringify(d)).not.toMatch(/سري|مهمة سرية/);
    expect(d.stats.open_tasks.value).toBe(0);
    const a = (await get("/dashboard/summary", admin.headers)).json().data;
    expect(a.stats.open_tasks.value).toBe(1);
  });
});

describe("folders, files and reports", () => {
  it("a team member creates a project folder (the same name may repeat across projects), uploads files and images into it", async () => {
    const { admin, A, B, sara } = await world();
    await send("PUT", `/projects/${B.id}/members`, { members: [{ user_id: sara.userId }] }, admin.headers);
    const fa = await send("POST", "/files/folders", { name: "تقارير", project_id: A.id }, sara.headers);
    expect(fa.statusCode).toBe(201);
    expect(fa.json().data).toMatchObject({ name: "تقارير", project_id: A.id });
    expect((await send("POST", "/files/folders", { name: "تقارير", project_id: B.id }, sara.headers)).statusCode).toBe(201);
    expect((await send("POST", "/files/folders", { name: "تقارير", project_id: A.id }, sara.headers)).json().errors.name).toBeTruthy();

    const photo = await upload("/files", sara.headers, [{ name: "file", filename: "site.png", type: "image/png", content: PNG }, { name: "folder_id", value: String(fa.json().data.id) }]);
    expect(photo.statusCode).toBe(201);
    expect(photo.json().data).toMatchObject({ name: "site.png", mime: "image/png", folder_id: fa.json().data.id });
  });

  it("nobody outside the team sees the folder, lists its files or downloads them or puts files into it", async () => {
    const { admin, A, sara } = await world();
    const outsider = await member(app, admin, { email: "out@org.org", permissions: WORKER });
    const folder = (await send("POST", "/files/folders", { name: "سري", project_id: A.id }, admin.headers)).json().data;
    const file = (await upload("/files", admin.headers, [{ name: "file", filename: "d.pdf", type: "application/pdf", content: PDF }, { name: "folder_id", value: String(folder.id) }])).json().data;

    expect((await get("/files/folders", outsider.headers)).json().data.map((f) => f.name)).not.toContain("سري");
    expect((await get("/files/folders", sara.headers)).json().data.map((f) => f.name)).toContain("سري");
    expect((await get("/files", outsider.headers)).json().data.map((f) => f.id)).not.toContain(file.id);
    expect((await get("/files", sara.headers)).json().data.map((f) => f.id)).toContain(file.id);
    expect((await get(`/files/${file.id}/download`, outsider.headers)).statusCode).toBe(404);
    expect((await get(`/files/${file.id}/download`, sara.headers)).statusCode).toBe(200);
    expect((await upload("/files", outsider.headers, [{ name: "file", filename: "x.pdf", type: "application/pdf", content: PDF }, { name: "folder_id", value: String(folder.id) }])).statusCode).toBe(422);
    expect((await send("POST", "/files/folders", { name: "ن", project_id: A.id }, outsider.headers)).statusCode).toBe(422);
  });

  it("reports are uploaded into a project folder, listed per folder/project, and re-filed into another folder", async () => {
    const { admin, A, sara } = await world();
    const outsider = await member(app, admin, { email: "out@org.org", permissions: WORKER });
    const f1 = (await send("POST", "/files/folders", { name: "شهرية", project_id: A.id }, sara.headers)).json().data;
    const f2 = (await send("POST", "/files/folders", { name: "ربعية", project_id: A.id }, sara.headers)).json().data;

    const res = await upload("/reports", sara.headers, [{ name: "file", filename: "march.pdf", type: "application/pdf", content: PDF }, { name: "name", value: "تقرير آذار" }, { name: "folder_id", value: String(f1.id) }]);
    expect(res.statusCode).toBe(201);
    const r = res.json().data;
    expect(r).toMatchObject({ name: "تقرير آذار", folder_id: f1.id, project_id: A.id });

    expect((await get(`/reports?folder_id=${f1.id}`, sara.headers)).json().meta.total).toBe(1);
    expect((await get(`/reports?project_id=${A.id}`, sara.headers)).json().meta.total).toBe(1);
    expect((await get(`/reports?folder_id=${f2.id}`, sara.headers)).json().meta.total).toBe(0);

    const moved = await send("PATCH", `/reports/${r.id}`, { folder_id: f2.id, name: "آذار 2026" }, sara.headers);
    expect(moved.json().data).toMatchObject({ folder_id: f2.id, project_id: A.id, name: "آذار 2026" });
    const unfiled = await send("PATCH", `/reports/${r.id}`, { folder_id: "" }, sara.headers);
    expect(unfiled.json().data).toMatchObject({ folder_id: null, project_id: A.id }); // stays in the project

    // reach and rights
    expect((await get("/reports", outsider.headers)).json().meta.total).toBe(0);
    expect((await get(`/reports/${r.id}/download`, outsider.headers)).statusCode).toBe(404);
    expect((await get(`/reports/${r.id}/download`, sara.headers)).statusCode).toBe(200);
    expect((await send("PATCH", `/reports/${r.id}`, { name: "x" }, outsider.headers)).statusCode).toBe(404);
    const viewer = await member(app, admin, { email: "v@org.org", permissions: ["projects.view", "reports.view"] });
    expect((await send("PATCH", `/reports/${r.id}`, { name: "x" }, viewer.headers)).statusCode).toBe(403);
    expect((await upload("/reports", outsider.headers, [{ name: "file", filename: "x.pdf", type: "application/pdf", content: PDF }, { name: "folder_id", value: String(f1.id) }])).statusCode).toBe(422);
  });

  it("a report can also be uploaded straight into a project (no folder), with an image if wanted", async () => {
    const { A, sara } = await world();
    const res = await upload("/reports", sara.headers, [{ name: "file", filename: "chart.png", type: "image/png", content: PNG }, { name: "project_id", value: String(A.id) }]);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ name: "chart", project_id: A.id, folder_id: null });
  });

  it("nothing is organization-wide any more: a folder, report, file, request or task without a project is refused", async () => {
    const { admin, A } = await world();
    expect((await send("POST", "/files/folders", { name: "عام" }, admin.headers)).json().errors.project_id).toBeTruthy();
    const noProject = [{ name: "file", filename: "g.pdf", type: "application/pdf", content: PDF }];
    expect((await upload("/reports", admin.headers, noProject)).json().errors.project_id).toBeTruthy();
    expect((await upload("/files", admin.headers, noProject)).json().errors.folder_id).toBeTruthy();
    expect((await send("POST", "/requests", { title: "x", type: "y" }, admin.headers)).statusCode).toBe(422);
    expect((await send("POST", "/tasks", { title: "x" }, admin.headers)).statusCode).toBe(422);
    // and the database itself agrees
    await expect(app.db("requests").insert({ organization_id: admin.organizationId, code: "R", title: "x" })).rejects.toThrow(/NOT NULL|not-null/i);
    await expect(app.db("tasks").insert({ organization_id: admin.organizationId, code: "T", title: "x" })).rejects.toThrow(/NOT NULL|not-null/i);
    await expect(app.db("folders").insert({ organization_id: admin.organizationId, name: "x" })).rejects.toThrow(/NOT NULL|not-null/i);
    await expect(app.db("reports").insert({ organization_id: admin.organizationId, name: "x" })).rejects.toThrow(/NOT NULL|not-null/i);
    await expect(app.db("files").insert({ organization_id: admin.organizationId, name: "x", storage_key: "k" })).rejects.toThrow(/NOT NULL|not-null/i);
    void A;
  });
});

describe("select lists", () => {
  it("GET /options.projects lists the projects a person works in (plus any list the admin kept by hand)", async () => {
    const { admin, sara } = await world();
    await send("PUT", "/options/projects", { values: ["مشروع قديم"] }, admin.headers);
    const forSara = (await get("/options", sara.headers)).json().data.projects;
    expect(forSara).toEqual(["مشروع قديم", "مشروع أ"]);
    expect((await get("/options", admin.headers)).json().data.projects).toEqual(["مشروع قديم", "مشروع أ", "مشروع ب"]);
  });

  it("archived and completed projects are not offered for new work", async () => {
    const { admin, A, sara } = await world();
    await send("PUT", `/projects/${A.id}`, { status: "archived" }, admin.headers);
    expect((await get("/options", sara.headers)).json().data.projects).toEqual([]);
  });
});
