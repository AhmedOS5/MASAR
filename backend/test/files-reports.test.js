import { afterEach, describe, expect, it } from "vitest";
import { testApp, signedInAdmin, member, makeProject, multipart, filesOnDisk, PDF, PNG } from "./helpers.js";
import { monthlyProgress } from "../src/modules/reports/routes.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const get = (url, headers) => app.inject({ url, headers });
const send = (method, url, payload, headers) => app.inject({ method, url, payload, headers });
const upload = (url, headers, parts) => {
  const m = multipart(parts);
  return app.inject({ method: "POST", url, payload: m.payload, headers: { ...headers, ...m.headers } });
};
const file = (name = "تقرير.pdf", content = PDF, type = "application/pdf") => ({ name: "file", filename: name, type, content });
const otherOrg = () => signedInAdmin(app, { admin_email: "boss@other.org", organization_name: "B", organization_email: "x@other.org" });

/** A project of `admin` (with `team` = [{ user, role }]) and a folder in it for each name. Everything lives in a project: no folder without one, no file without a folder. */
async function workspace(admin, { team = [], names = ["الوثائق الرسمية", "التقارير الميدانية"] } = {}) {
  const project = await makeProject(app, admin, team);
  const folders = [];
  for (const name of names) {
    const res = await send("POST", "/files/folders", { name, project_id: project }, admin.headers);
    if (res.statusCode !== 201) throw new Error(res.body);
    folders.push(res.json().data);
  }
  return { project, folders };
}
const inFolder = (folder, ...parts) => [...parts, { name: "folder_id", value: String(folder.id) }];

describe("folders", () => {
  it("a new organization has no folders (they live inside projects); counts are live", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    expect((await get("/files/folders", admin.headers)).json().meta.total).toBe(0);
    const { folders, project } = await workspace(admin);
    const { data, meta } = (await get("/files/folders", admin.headers)).json();
    expect(meta.total).toBe(2);
    expect(data.map((f) => f.name)).toEqual(["الوثائق الرسمية", "التقارير الميدانية"]);
    expect(data.every((f) => f.items_count === 0 && f.project_id === project)).toBe(true);
    await upload("/files", admin.headers, inFolder(folders[0], file()));
    expect((await get("/files/folders", admin.headers)).json().data[0].items_count).toBe(1);
  });

  it("POST /files/folders needs a project; duplicate names (any case) are 422 within a project only", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const b = await otherOrg();
    const p1 = await makeProject(app, admin);
    const p2 = await makeProject(app, admin);
    const pb = await makeProject(app, b);
    const res = await send("POST", "/files/folders", { name: "  العقود ", project_id: p1 }, admin.headers);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toEqual({ id: expect.any(Number), name: "العقود", project_id: p1, items_count: 0 });
    expect((await send("POST", "/files/folders", { name: "العقود", project_id: p1 }, admin.headers)).json().errors.name).toBeTruthy();
    expect((await send("POST", "/files/folders", { name: "العقود", project_id: p2 }, admin.headers)).statusCode).toBe(201); // same name, another project
    expect((await send("POST", "/files/folders", { project_id: p1 }, admin.headers)).statusCode).toBe(422);
    for (const project_id of [undefined, null, "", 9999, pb]) {
      const r = await send("POST", "/files/folders", { name: "بلا مشروع", project_id }, admin.headers);
      expect(r.statusCode, String(project_id)).toBe(422);
      expect(r.json().errors.project_id).toBeTruthy();
    }
    expect((await send("POST", "/files/folders", { name: "العقود", project_id: pb }, b.headers)).statusCode).toBe(201);
    expect((await get("/files/folders", b.headers)).json().meta.total).toBe(1);
    expect((await get("/files/folders", admin.headers)).json().meta.total).toBe(2);
  });

  it("needs files.view / files.upload", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const viewer = await member(app, admin, { permissions: ["files.view"] });
    const none = await member(app, admin, { email: "n@org.org" });
    expect((await get("/files/folders", viewer.headers)).statusCode).toBe(200);
    expect((await get("/files/folders", none.headers)).statusCode).toBe(403);
    const project = await makeProject(app, admin, [{ user: viewer }]);
    expect((await send("POST", "/files/folders", { name: "x", project_id: project }, viewer.headers)).statusCode).toBe(403);
    expect((await get("/files/folders")).statusCode).toBe(401);
  });
});

describe("files", () => {
  it("uploads with the form's field order (file first, then folder_id) and lists/downloads it", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const folder = (await workspace(admin)).folders[1];
    const res = await upload("/files", admin.headers, inFolder(folder, file("جدول.pdf")));
    expect(res.statusCode).toBe(201);
    const f = res.json().data;
    expect(f).toMatchObject({ name: "جدول.pdf", size: PDF.length, mime: "application/pdf", folder_id: folder.id, created_at: expect.stringMatching(/Z$/) });

    const list = (await get(`/files?folder_id=${folder.id}&per_page=24`, admin.headers)).json();
    expect(list.data).toEqual([f]);
    const dl = await get(`/files/${f.id}/download`, admin.headers);
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.equals(PDF)).toBe(true);
    expect(dl.headers["content-type"]).toBe("application/pdf");
    expect(dl.headers["content-disposition"]).toMatch(/^attachment; filename=".*"; filename\*=UTF-8''/);
    expect(dl.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("accepts any file type, but a file always goes into a folder of a project", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { folders } = await workspace(admin);
    const res = await upload("/files", admin.headers, inFolder(folders[0], file("notes.txt", "plain text", "text/plain")));
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ name: "notes.txt", mime: "text/plain", folder_id: folders[0].id });

    const loose = await upload("/files", admin.headers, [file("loose.txt", "x", "text/plain")]);
    expect(loose.statusCode).toBe(422);
    expect(loose.json().errors.folder_id).toEqual(["الحقل مطلوب."]);
    expect((await upload("/files", admin.headers, [file(), { name: "folder_id", value: "" }])).statusCode).toBe(422);
    expect(filesOnDisk(app)).toHaveLength(1); // the rejected uploads left nothing behind
    expect(Number((await app.db("files").count({ n: "*" }).first()).n)).toBe(1);
  });

  it("rejects a folder from another organization / unknown / non-numeric — and leaves no file behind", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const b = await otherOrg();
    const foreign = (await workspace(b)).folders[0];
    for (const folder_id of [String(foreign.id), "9999", "abc"]) {
      const r = await upload("/files", admin.headers, [file(), { name: "folder_id", value: folder_id }]);
      expect(r.statusCode, folder_id).toBe(422);
      expect(r.json().errors.folder_id).toBeTruthy();
    }
    expect(filesOnDisk(app)).toHaveLength(0);
    expect(Number((await app.db("files").count({ n: "*" }).first()).n)).toBe(0);
  });

  it("422 without a file or with a wrong field; 413 above the limit; nothing stored", async () => {
    app = await testApp({ env: { MAX_UPLOAD_MB: "1" } });
    const admin = await signedInAdmin(app);
    expect((await send("POST", "/files", {}, admin.headers)).statusCode).toBe(422);
    expect((await upload("/files", admin.headers, [{ name: "avatar", filename: "a.txt", type: "text/plain", content: "x" }])).statusCode).toBe(422);
    expect((await upload("/files", admin.headers, [file("big.bin", Buffer.alloc(1024 * 1024 + 5), "application/octet-stream")])).statusCode).toBe(413);
    expect(filesOnDisk(app)).toHaveLength(0);
  });

  it("lists newest first with pagination, folder filter, search; 'all' means everything", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { folders } = await workspace(admin);
    const rows = [];
    for (let i = 1; i <= 12; i++) {
      rows.push({ organization_id: admin.organizationId, folder_id: folders[i % 2].id, name: i === 3 ? "100% ملف_خاص.pdf" : `ملف ${i}.pdf`, size: 10, mime: "application/pdf", storage_key: `org-1/files/x${i}`, created_at: new Date(Date.UTC(2026, 0, i)).toISOString() });
    }
    await app.db("files").insert(rows);
    const page2 = (await get("/files?per_page=5&page=2", admin.headers)).json();
    expect(page2.meta).toMatchObject({ total: 12, last_page: 3, current_page: 2 });
    expect(page2.data.map((f) => f.name)).toEqual(["ملف 7.pdf", "ملف 6.pdf", "ملف 5.pdf", "ملف 4.pdf", "100% ملف_خاص.pdf"]);
    expect((await get(`/files?folder_id=${folders[0].id}&per_page=50`, admin.headers)).json().meta.total).toBe(6);
    expect((await get("/files?folder_id=all", admin.headers)).json().meta.total).toBe(12);
    expect((await get("/files?folder_id=abc", admin.headers)).json().meta.total).toBe(0);
    expect((await get(`/files?search=${encodeURIComponent("100%")}`, admin.headers)).json().meta.total).toBe(1);
  });

  it("is organization-scoped: no listing, no download across organizations", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const b = await otherOrg();
    const { folders } = await workspace(admin);
    const f = (await upload("/files", admin.headers, inFolder(folders[0], file()))).json().data;
    expect((await get("/files", b.headers)).json().meta.total).toBe(0);
    expect((await get(`/files/${f.id}/download`, b.headers)).statusCode).toBe(404);
    expect((await get("/files/9999/download", admin.headers)).statusCode).toBe(404);
    expect((await get("/files/abc/download", admin.headers)).statusCode).toBe(404);
  });

  it("a row whose file vanished from storage downloads as 404, not 500", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { folders } = await workspace(admin);
    const f = (await upload("/files", admin.headers, inFolder(folders[0], file()))).json().data;
    for (const p of filesOnDisk(app)) (await import("node:fs")).rmSync(p);
    expect((await get(`/files/${f.id}/download`, admin.headers)).statusCode).toBe(404);
  });

  it("needs files.view to read and files.upload to write", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const viewer = await member(app, admin, { permissions: ["files.view"] });
    const uploader = await member(app, admin, { email: "u@org.org", permissions: ["files.upload"] });
    const { folders } = await workspace(admin, { team: [{ user: viewer }, { user: uploader }] });
    expect((await upload("/files", viewer.headers, inFolder(folders[0], file()))).statusCode).toBe(403);
    expect((await upload("/files", uploader.headers, inFolder(folders[0], file()))).statusCode).toBe(201);
    expect((await get("/files", uploader.headers)).statusCode).toBe(403);
    expect((await get("/files", viewer.headers)).json().meta.total).toBe(1);
    expect((await upload("/files", undefined, inFolder(folders[0], file()))).statusCode).toBe(401);
    expect(filesOnDisk(app)).toHaveLength(1);
  });
});

describe("reports", () => {
  it("monthlyProgress compares this month with last month", () => {
    expect(monthlyProgress(0, 0)).toBe(0);
    expect(monthlyProgress(3, 0)).toBe(100);
    expect(monthlyProgress(3, 2)).toBe(50);
    expect(monthlyProgress(1, 4)).toBe(-75);
    expect(monthlyProgress(0, 5)).toBe(-100);
    expect(monthlyProgress(2, 2)).toBe(0);
  });

  it("summary: report count, month-over-month task completion, active units", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const project = await makeProject(app, admin);
    expect((await get("/reports/summary", admin.headers)).json().data).toEqual({ total_reports: 0, monthly_progress: 0, active_sections: 2 });

    const now = new Date();
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12)).toISOString();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)).toISOString();
    const older = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 15)).toISOString();
    const t = (n, completed_at) => ({ organization_id: admin.organizationId, code: `TSK-${n}`, project_id: project, title: "t", status: completed_at ? "done" : "todo", completed_at });
    await app.db("tasks").insert([t(1, thisMonth), t(2, thisMonth), t(3, thisMonth), t(4, lastMonth), t(5, lastMonth), t(6, older), t(7, null)]);
    await app.db("reports").insert({ organization_id: admin.organizationId, project_id: project, name: "r", created_at: new Date().toISOString() });
    await send("PATCH", "/units/2", { enabled: false }, admin.headers);
    expect((await get("/reports/summary", admin.headers)).json().data).toEqual({ total_reports: 1, monthly_progress: 50, active_sections: 1 });
  });

  it("completing a task through the API feeds the figure; reopening removes it", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const project = await makeProject(app, admin);
    const t = (await send("POST", "/tasks", { title: "t", project_id: project }, admin.headers)).json().data;
    expect((await app.db("tasks").first()).completed_at).toBeNull();
    await send("PATCH", `/tasks/${t.id}`, { status: "done" }, admin.headers);
    expect(new Date((await app.db("tasks").first()).completed_at).toISOString()).toMatch(/Z$/);
    expect((await get("/reports/summary", admin.headers)).json().data.monthly_progress).toBe(100);
    await send("PATCH", `/tasks/${t.id}`, { status: "in_progress" }, admin.headers);
    expect((await app.db("tasks").first()).completed_at).toBeNull();
    expect((await get("/reports/summary", admin.headers)).json().data.monthly_progress).toBe(0);
  });

  it("POST /reports stores a document; list/filter/search/paginate; download keeps type and name", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const project = await makeProject(app, admin);
    const mk = (name, type, period) => upload("/reports", admin.headers, [file(`${name}.pdf`), { name: "name", value: name }, { name: "type", value: type }, { name: "period", value: period }, { name: "project_id", value: String(project) }]);
    const res = await mk("تقرير مالي", "مالي", "مايو 2026");
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ name: "تقرير مالي", type: "مالي", period: "مايو 2026", size: PDF.length, project_id: project });
    for (let i = 0; i < 11; i++) await mk(`تقرير متابعة ${i}`, "تقرير متابعة", "Q1 2026");

    const all = (await get("/reports?per_page=5", admin.headers)).json();
    expect(all.meta).toMatchObject({ total: 12, last_page: 3 });
    expect(all.data[0].name).toBe("تقرير متابعة 10"); // newest first
    expect((await get(`/reports?type=${encodeURIComponent("مالي")}`, admin.headers)).json().data.map((r) => r.name)).toEqual(["تقرير مالي"]);
    expect((await get("/reports?type=all&search=", admin.headers)).json().meta.total).toBe(12);
    expect((await get(`/reports?search=${encodeURIComponent("متابعة 3")}`, admin.headers)).json().meta.total).toBe(1);

    const dl = await get(`/reports/${res.json().data.id}/download`, admin.headers);
    expect(dl.statusCode).toBe(200);
    expect(dl.headers["content-type"]).toBe("application/pdf");
    expect(dl.rawPayload.equals(PDF)).toBe(true);
    expect(dl.headers["content-disposition"]).toContain(encodeURIComponent("تقرير مالي.pdf"));
  });

  it("name defaults to the file name; other metadata is optional; a project is not; validation errors leave no file", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const { project, folders } = await workspace(admin);
    const inProject = { name: "project_id", value: String(project) };
    const res = await upload("/reports", admin.headers, [file("ميزانية 2026.pdf"), inProject]);
    expect(res.json().data).toMatchObject({ name: "ميزانية 2026", type: null, period: null, project_id: project, folder_id: null });
    // a folder decides the project
    const filed = await upload("/reports", admin.headers, inFolder(folders[0], file("مرفق.pdf")));
    expect(filed.json().data).toMatchObject({ project_id: project, folder_id: folders[0].id });

    const noProject = await upload("/reports", admin.headers, [file()]);
    expect(noProject.statusCode).toBe(422);
    expect(noProject.json().errors.project_id).toBeTruthy();
    const unknown = await upload("/reports", admin.headers, [file(), { name: "project_id", value: "9999" }]);
    expect(unknown.statusCode).toBe(422);
    const tooLong = await upload("/reports", admin.headers, [file(), inProject, { name: "name", value: "x".repeat(300) }]);
    expect(tooLong.statusCode).toBe(422);
    expect(filesOnDisk(app)).toHaveLength(2); // only the two stored reports
    expect((await send("POST", "/reports", {}, admin.headers)).statusCode).toBe(422);
  });

  it("is organization-scoped and permission-guarded; a missing stored file is 404", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const b = await otherOrg();
    const viewer = await member(app, admin, { permissions: ["reports.view"] });
    const none = await member(app, admin, { email: "n@org.org" });
    const project = await makeProject(app, admin, [{ user: viewer }]);
    const inProject = { name: "project_id", value: String(project) };
    const r = (await upload("/reports", admin.headers, [file(), inProject])).json().data;

    expect((await get("/reports", b.headers)).json().meta.total).toBe(0);
    expect((await get(`/reports/${r.id}/download`, b.headers)).statusCode).toBe(404);
    expect((await get("/reports/summary", b.headers)).json().data.total_reports).toBe(0);
    expect((await get(`/reports/${r.id}/download`, viewer.headers)).statusCode).toBe(200);
    expect((await upload("/reports", viewer.headers, [file(), inProject])).statusCode).toBe(403);
    expect((await get("/reports", none.headers)).statusCode).toBe(403);
    expect((await get("/reports/summary", none.headers)).statusCode).toBe(403);
    expect((await get("/reports")).statusCode).toBe(401);

    await app.db("reports").insert({ organization_id: admin.organizationId, project_id: project, name: "no file" }); // legacy "render on demand" row
    const orphan = (await app.db("reports").orderBy("id", "desc").first()).id;
    expect((await get(`/reports/${orphan}/download`, admin.headers)).statusCode).toBe(404);
    for (const p of filesOnDisk(app)) (await import("node:fs")).rmSync(p);
    expect((await get(`/reports/${r.id}/download`, admin.headers)).statusCode).toBe(404);
    void PNG;
  });
});

describe("deleting files, folders and reports", () => {
  const PERMS = ["files.view", "files.upload", "reports.view", "reports.manage"];
  /** admin + two team members (a, b), a supervisor, a view-only member and an outsider who holds the same permissions but is not on the project */
  async function setup() {
    const admin = await signedInAdmin(app);
    const a = await member(app, admin, { email: "a@org.org", permissions: PERMS });
    const b = await member(app, admin, { email: "b@org.org", permissions: PERMS });
    const sup = await member(app, admin, { email: "s@org.org", permissions: PERMS });
    const viewer = await member(app, admin, { email: "v@org.org", permissions: ["files.view", "reports.view"] });
    const outsider = await member(app, admin, { email: "o@org.org", permissions: PERMS });
    const ws = await workspace(admin, { team: [{ user: a }, { user: b }, { user: sup, role: "supervisor" }, { user: viewer }] });
    return { admin, a, b, sup, viewer, outsider, ...ws };
  }
  const del = (url, headers) => send("DELETE", url, undefined, headers);

  it("DELETE /files/:id: the uploader, a supervisor or an admin may; other members 403, outsiders and other orgs 404", async () => {
    app = await testApp();
    const { admin, a, b, sup, viewer, outsider, folders } = await setup();
    const other = await otherOrg();
    const mine = (await upload("/files", a.headers, inFolder(folders[0], file()))).json().data;
    expect(filesOnDisk(app)).toHaveLength(1);

    expect((await del(`/files/${mine.id}`, viewer.headers)).statusCode).toBe(403); // no files.upload
    expect((await del(`/files/${mine.id}`, b.headers)).statusCode).toBe(403); // a member, not the uploader
    expect((await del(`/files/${mine.id}`, outsider.headers)).statusCode).toBe(404); // not on the project
    expect((await del(`/files/${mine.id}`, other.headers)).statusCode).toBe(404); // another organization
    expect((await del("/files/9999", a.headers)).statusCode).toBe(404);
    expect(filesOnDisk(app)).toHaveLength(1);

    expect((await del(`/files/${mine.id}`, a.headers)).statusCode).toBe(204);
    expect(filesOnDisk(app)).toHaveLength(0);
    expect((await get("/files", admin.headers)).json().meta.total).toBe(0);
    expect((await del(`/files/${mine.id}`, a.headers)).statusCode).toBe(404); // already gone
    const audit = await app.db("audit_logs").where({ action: "file.deleted" });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entity_type: "file", entity_id: mine.id, actor_id: a.userId });

    const second = (await upload("/files", a.headers, inFolder(folders[0], file("ب.pdf")))).json().data;
    expect((await del(`/files/${second.id}`, sup.headers)).statusCode).toBe(204); // supervisor
    const third = (await upload("/files", b.headers, inFolder(folders[0], file("ج.pdf")))).json().data;
    expect((await del(`/files/${third.id}`, admin.headers)).statusCode).toBe(204); // full access
    expect(filesOnDisk(app)).toHaveLength(0);
  });

  it("DELETE /files/folders/:id: supervisors and admins only; it removes the folder's files, keeps its reports", async () => {
    app = await testApp();
    const { admin, a, sup, outsider, folders } = await setup();
    await upload("/files", a.headers, inFolder(folders[0], file("1.pdf")));
    await upload("/files", a.headers, inFolder(folders[0], file("2.pdf")));
    await upload("/files", a.headers, inFolder(folders[1], file("3.pdf")));
    const report = (await upload("/reports", a.headers, [file("تقرير.pdf"), { name: "name", value: "تقرير" }, { name: "folder_id", value: String(folders[0].id) }])).json().data;
    expect(report.folder_id).toBe(folders[0].id);
    expect(filesOnDisk(app)).toHaveLength(4);

    expect((await del(`/files/folders/${folders[0].id}`, a.headers)).statusCode).toBe(403); // a plain member
    expect((await del(`/files/folders/${folders[0].id}`, outsider.headers)).statusCode).toBe(404);
    expect((await del("/files/folders/9999", sup.headers)).statusCode).toBe(404);
    expect(filesOnDisk(app)).toHaveLength(4);

    expect((await del(`/files/folders/${folders[0].id}`, sup.headers)).statusCode).toBe(204);
    expect(filesOnDisk(app)).toHaveLength(2); // the other folder's file and the report's document remain
    const left = (await get("/files/folders", admin.headers)).json();
    expect(left.data.map((f) => f.id)).toEqual([folders[1].id]);
    expect((await get("/files", admin.headers)).json().meta.total).toBe(1);
    expect((await get("/reports", admin.headers)).json().data).toEqual([expect.objectContaining({ id: report.id, folder_id: null })]);
    expect(await app.db("audit_logs").where({ action: "folder.deleted", entity_id: folders[0].id })).toHaveLength(1);
  });

  it("DELETE /reports/:id: needs reports.manage; the author, a supervisor or an admin may; it removes the document", async () => {
    app = await testApp();
    const { admin, a, b, sup, viewer, outsider, folders } = await setup();
    const other = await otherOrg();
    const make = async (user) => (await upload("/reports", user.headers, [file(), { name: "name", value: "تقرير" }, { name: "folder_id", value: String(folders[0].id) }])).json().data;
    const r = await make(a);
    expect(filesOnDisk(app)).toHaveLength(1);

    expect((await del(`/reports/${r.id}`, viewer.headers)).statusCode).toBe(403); // no reports.manage
    expect((await del(`/reports/${r.id}`, b.headers)).statusCode).toBe(403); // not the author
    expect((await del(`/reports/${r.id}`, outsider.headers)).statusCode).toBe(404);
    expect((await del(`/reports/${r.id}`, other.headers)).statusCode).toBe(404);
    expect(filesOnDisk(app)).toHaveLength(1);

    expect((await del(`/reports/${r.id}`, a.headers)).statusCode).toBe(204);
    expect(filesOnDisk(app)).toHaveLength(0);
    expect((await get("/reports", admin.headers)).json().meta.total).toBe(0);
    expect((await get(`/reports/${r.id}/download`, admin.headers)).statusCode).toBe(404);
    expect(await app.db("audit_logs").where({ action: "report.deleted", entity_id: r.id, actor_id: a.userId })).toHaveLength(1);

    expect((await del(`/reports/${(await make(b)).id}`, sup.headers)).statusCode).toBe(204);
    expect((await del(`/reports/${(await make(b)).id}`, admin.headers)).statusCode).toBe(204);
    expect(filesOnDisk(app)).toHaveLength(0);
  });
});
