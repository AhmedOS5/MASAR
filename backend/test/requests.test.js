import { afterEach, describe, expect, it } from "vitest";
import { testApp, signedInAdmin, newcomer, member, makeProject, multipart, filesOnDisk, PDF } from "./helpers.js";

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
const file = (name = "ملف.txt", content = "hello", type = "text/plain", field = "file") => ({ name: field, filename: name, type, content });
const otherOrg = () => signedInAdmin(app, { admin_email: "boss@other.org", organization_name: "B", organization_email: "x@other.org" });

/** admin + a requester (view/create) + an approver (view/approve) + a viewer (view only) — all on one project; the approver supervises it */
let pid;
async function team() {
  const admin = await signedInAdmin(app);
  const requester = await member(app, admin, { email: "req@org.org", name: "مقدّم", permissions: ["requests.view", "requests.create", "tasks.view"] });
  const approver = await member(app, admin, { email: "app@org.org", name: "معتمد", permissions: ["requests.view", "requests.approve"] });
  const viewer = await member(app, admin, { email: "view@org.org", name: "مشاهد", permissions: ["requests.view"] });
  pid = await makeProject(app, admin, [{ user: requester }, { user: approver, role: "supervisor" }, { user: viewer }]);
  return { admin, requester, approver, viewer, project: pid };
}
const body = (over = {}) => ({ title: "شراء معدات", type: "مشتريات", department: "المالية", priority: "high", amount: 2500.75, description: "وصف", project_id: pid, ...over });
const create = async (user, over) => (await send("POST", "/requests", body(over), user.headers)).json().data;
const notes = (userId) => app.db("notifications").where({ user_id: userId }).orderBy("id");

describe("POST /requests", () => {
  it("creates a pending request with a code, requester and a 'created' activity", async () => {
    app = await testApp();
    const { requester } = await team();
    const res = await send("POST", "/requests", body(), requester.headers);
    expect(res.statusCode).toBe(201);
    const r = res.json().data;
    expect(r).toMatchObject({
      code: "REQ-001", title: "شراء معدات", status: "pending", project_id: pid, project: { id: pid }, priority: "high", type: "مشتريات", department: "المالية",
      amount: 2500.75, description: "وصف", requester: { name: "مقدّم" }, comments: [], attachments: [],
    });
    expect(r.created_at).toMatch(/Z$/);
    expect(r.activities).toEqual([{ id: expect.any(Number), text: expect.any(String), kind: "created", created_at: expect.any(String) }]);
    expect((await create(requester)).code).toBe("REQ-002");
  });

  it("accepts what the form sends: blank department/priority, amount null", async () => {
    app = await testApp();
    const { requester } = await team();
    const r = await create(requester, { department: "", priority: "", amount: null, description: "" });
    expect(r).toMatchObject({ department: null, priority: "medium", amount: null, description: null });
  });

  it("422 for missing project/title/type, bad priority, bad or negative amount", async () => {
    app = await testApp();
    const { requester } = await team();
    const res = await send("POST", "/requests", {}, requester.headers);
    expect(res.statusCode).toBe(422);
    expect(Object.keys(res.json().errors).sort()).toEqual(["project_id", "title", "type"]);
    for (const [over, field] of [[{ priority: "asap" }, "priority"], [{ amount: -5 }, "amount"], [{ amount: "abc" }, "amount"], [{ amount: 2e12 }, "amount"], [{ title: "x".repeat(300) }, "title"]]) {
      const r = await send("POST", "/requests", body(over), requester.headers);
      expect(r.statusCode, field).toBe(422);
      expect(r.json().errors[field], field).toBeTruthy();
    }
  });

  it("ignores fields a client must not set (status, code, requester, organization)", async () => {
    app = await testApp();
    const { requester, admin } = await team();
    const r = await create(requester, { status: "approved", code: "HACK-1", requester_id: admin.userId, organization_id: 999, decided_by: admin.userId });
    expect(r).toMatchObject({ status: "pending", code: "REQ-001", requester: { name: "مقدّم" } });
    expect((await app.db("requests").first()).organization_id).toBe(admin.organizationId);
  });

  it("notifies approvers (not the requester) about the new request", async () => {
    app = await testApp();
    const { requester, approver, viewer, admin } = await team();
    const r = await create(requester);
    const forApprover = await notes(approver.userId);
    expect(forApprover).toHaveLength(1);
    expect(forApprover[0]).toMatchObject({ title: "طلب جديد بانتظار الموافقة", link: `/dashboard/requests/${r.id}` });
    expect(Boolean(forApprover[0].is_read)).toBe(false);
    expect(await notes(admin.userId)).toHaveLength(1); // system admins hold every permission
    expect(await notes(requester.userId)).toHaveLength(0);
    expect(await notes(viewer.userId)).toHaveLength(0);
  });

  it("a project is mandatory: missing, unknown, another organization's or one the person is not on is 422 on project_id", async () => {
    app = await testApp();
    const { requester, admin } = await team();
    const b = await otherOrg();
    const foreign = await makeProject(app, b, [], { name: "غريب" });
    const mine = await makeProject(app, admin, [], { name: "لا أنتمي إليه" }); // the requester is not on this team
    for (const project_id of [undefined, null, "", 999, "abc", foreign, mine]) {
      const res = await send("POST", "/requests", body({ project_id }), requester.headers);
      expect(res.statusCode, String(project_id)).toBe(422);
      expect(res.json().errors.project_id, String(project_id)).toBeTruthy();
    }
    expect(Number((await app.db("requests").count({ n: "*" }).first()).n)).toBe(0);
  });

  it("needs requests.create; 401 anonymous; 403 before approval", async () => {
    app = await testApp();
    const { viewer } = await team();
    expect((await send("POST", "/requests", body(), viewer.headers)).statusCode).toBe(403);
    expect((await send("POST", "/requests", body())).statusCode).toBe(401);
    const n = await newcomer(app, { admin_email: "n@new.org", organization_name: "N" });
    expect((await send("POST", "/requests", body(), n.headers)).statusCode).toBe(403);
  });
});

describe("GET /requests", () => {
  async function seed(admin) {
    const rows = [];
    for (let i = 1; i <= 23; i++) {
      rows.push({
        organization_id: admin.organizationId, code: `REQ-${String(i).padStart(3, "0")}`, title: i === 7 ? "100% عاجل_خاص" : `طلب اختبار ${i}`,
        status: ["pending", "approved", "in_progress", "completed", "rejected", "draft"][i % 6], priority: ["low", "medium", "high", "urgent"][i % 4],
        project_id: pid, requester_id: admin.userId, created_at: new Date(Date.UTC(2026, 2, i)).toISOString(), updated_at: new Date().toISOString(),
      });
    }
    await app.db("requests").insert(rows);
  }

  it("paginates newest first with status_counts for every status", async () => {
    app = await testApp();
    const { admin } = await team();
    await seed(admin);
    const res = await get("/requests?page=3&per_page=10", admin.headers);
    expect(res.statusCode).toBe(200);
    const { data, meta } = res.json();
    expect(meta).toMatchObject({ total: 23, current_page: 3, last_page: 3, per_page: 10 });
    expect(data.map((r) => r.code)).toEqual(["REQ-003", "REQ-002", "REQ-001"]);
    expect(Object.keys(meta.status_counts).sort()).toEqual(["approved", "completed", "draft", "in_progress", "pending", "rejected"]);
    expect(Object.values(meta.status_counts).reduce((a, b) => a + b, 0)).toBe(23);
    expect(data[0]).toMatchObject({ requester: { name: "admin" }, status: expect.any(String) });
    expect(data[0].comments).toBeUndefined(); // list items are summaries
  });

  it("filters by status/priority/search; 'all' and blank mean no filter; badges ignore the status tab", async () => {
    app = await testApp();
    const { admin } = await team();
    await seed(admin);
    const pending = (await get("/requests?status=pending&per_page=100", admin.headers)).json();
    expect(pending.data.length).toBeGreaterThan(0);
    expect(pending.data.every((r) => r.status === "pending")).toBe(true);
    expect(pending.meta.status_counts.pending).toBe(pending.meta.total);
    expect(Object.values(pending.meta.status_counts).reduce((a, b) => a + b, 0)).toBe(23); // other tabs still counted

    const urgent = (await get("/requests?priority=urgent&per_page=100", admin.headers)).json();
    expect(urgent.data.every((r) => r.priority === "urgent")).toBe(true);
    expect(Object.values(urgent.meta.status_counts).reduce((a, b) => a + b, 0)).toBe(urgent.meta.total);

    expect((await get("/requests?status=all&priority=all&search=", admin.headers)).json().meta.total).toBe(23);
    expect((await get("/requests?search=REQ-02", admin.headers)).json().meta.total).toBe(4);
    expect((await get(`/requests?search=${encodeURIComponent("100%")}`, admin.headers)).json().meta.total).toBe(1);
    expect((await get("/requests?status=bogus", admin.headers)).json().meta.total).toBe(0);
  });

  it("is organization-scoped and needs requests.view", async () => {
    app = await testApp();
    const { admin } = await team();
    const b = await otherOrg();
    await seed(admin);
    expect((await get("/requests", b.headers)).json().meta.total).toBe(0);
    const none = await member(app, admin, { email: "none@org.org" });
    expect((await get("/requests", none.headers)).statusCode).toBe(403);
    expect((await get("/requests")).statusCode).toBe(401);
  });
});

describe("GET /requests/:id", () => {
  it("returns the full request; other organizations and bad ids get 404", async () => {
    app = await testApp();
    const { requester, viewer } = await team();
    const b = await otherOrg();
    const r = await create(requester);
    const res = await get(`/requests/${r.id}`, viewer.headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: r.id, code: "REQ-001", comments: [], attachments: [], activities: [expect.any(Object)] });
    expect((await get(`/requests/${r.id}`, b.headers)).statusCode).toBe(404);
    expect((await get("/requests/999", viewer.headers)).statusCode).toBe(404);
    expect((await get("/requests/R-1", viewer.headers)).statusCode).toBe(404);
  });
});

describe("approve / reject", () => {
  it("each decision leaves an audit row (who decided, on which request, with the rejection reason)", async () => {
    app = await testApp();
    const { requester, approver } = await team();
    const a = await create(requester);
    const b = await create(requester);
    expect((await send("POST", `/requests/${a.id}/approve`, {}, approver.headers)).statusCode).toBe(200);
    expect((await send("POST", `/requests/${b.id}/reject`, { reason: "ميزانية غير كافية" }, approver.headers)).statusCode).toBe(200);
    expect((await send("POST", `/requests/${a.id}/approve`, {}, approver.headers)).statusCode).toBe(409); // a refused decision writes nothing
    const rows = await app.db("audit_logs").where({ entity_type: "request" }).orderBy("id");
    expect(rows.map((r) => [r.action, r.entity_id, r.actor_id])).toEqual([
      ["request.approved", a.id, approver.userId],
      ["request.rejected", b.id, approver.userId],
    ]);
    const meta = rows.map((r) => (typeof r.meta === "string" ? JSON.parse(r.meta) : r.meta));
    expect(meta[0]).toMatchObject({ project_id: pid, requester_id: requester.userId });
    expect(meta[1]).toMatchObject({ reason: "ميزانية غير كافية" });
  });

  it("approve: status, activity, requester notified; a second decision is 409", async () => {
    app = await testApp();
    const { requester, approver } = await team();
    const r = await create(requester);
    const res = await send("POST", `/requests/${r.id}/approve`, {}, approver.headers);
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.status).toBe("approved");
    expect(d.activities.map((a) => a.kind)).toEqual(["created", "reviewed"]);
    expect(d.activities[1].text).toContain("معتمد");
    expect((await notes(requester.userId))[0]).toMatchObject({ title: "تمت الموافقة على طلبك", type: "system", link: `/dashboard/requests/${r.id}` });
    const row = await app.db("requests").first();
    expect(row).toMatchObject({ decided_by: approver.userId });
    expect(row.decided_at).toBeTruthy();

    expect((await send("POST", `/requests/${r.id}/approve`, {}, approver.headers)).statusCode).toBe(409);
    expect((await send("POST", `/requests/${r.id}/reject`, { reason: "x" }, approver.headers)).statusCode).toBe(409);
  });

  it("reject: reason required, stored, requester alerted", async () => {
    app = await testApp();
    const { requester, approver } = await team();
    const r = await create(requester);
    const missing = await send("POST", `/requests/${r.id}/reject`, {}, approver.headers);
    expect(missing.statusCode).toBe(422);
    expect(missing.json().errors.reason).toBeTruthy();
    expect((await get(`/requests/${r.id}`, approver.headers)).json().data.status).toBe("pending");

    const res = await send("POST", `/requests/${r.id}/reject`, { reason: "الميزانية غير متاحة" }, approver.headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ status: "rejected", rejection_reason: "الميزانية غير متاحة" });
    expect(res.json().data.activities.at(-1)).toMatchObject({ kind: "rejected", text: expect.stringContaining("الميزانية غير متاحة") });
    expect((await notes(requester.userId))[0]).toMatchObject({ title: "تم رفض طلبك", type: "alert" });
    expect((await send("POST", `/requests/${r.id}/approve`, {}, approver.headers)).statusCode).toBe(409);
  });

  it("concurrent approve + reject: exactly one decision wins", async () => {
    app = await testApp();
    const { requester, approver } = await team();
    const r = await create(requester);
    const results = await Promise.all([
      send("POST", `/requests/${r.id}/approve`, {}, approver.headers),
      send("POST", `/requests/${r.id}/reject`, { reason: "no" }, approver.headers),
    ]);
    expect(results.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    expect(Number((await app.db("request_activities").whereNot({ kind: "created" }).count({ n: "*" }).first()).n)).toBe(1);
  });

  it("needs requests.approve; cannot touch other organizations' requests", async () => {
    app = await testApp();
    const { requester, viewer, approver } = await team();
    const b = await otherOrg();
    const r = await create(requester);
    expect((await send("POST", `/requests/${r.id}/approve`, {}, viewer.headers)).statusCode).toBe(403);
    expect((await send("POST", `/requests/${r.id}/reject`, { reason: "x" }, requester.headers)).statusCode).toBe(403);
    expect((await send("POST", `/requests/${r.id}/approve`, {}, b.headers)).statusCode).toBe(404);
    expect((await send("POST", "/requests/999/approve", {}, approver.headers)).statusCode).toBe(404);
    expect((await app.db("requests").first()).status).toBe("pending");
  });

  it("separation of duties: nobody decides a request they submitted — not even the system admin or the project's supervisor", async () => {
    app = await testApp();
    const { admin, approver } = await team();
    const mine = await create(admin);
    for (const [action, payload] of [["approve", {}], ["reject", { reason: "x" }]]) {
      const res = await send("POST", `/requests/${mine.id}/${action}`, payload, admin.headers);
      expect(res.statusCode, action).toBe(403);
      expect(res.json().message).toContain("فصل المهام");
    }
    expect((await app.db("requests").where({ id: mine.id }).first()).status).toBe("pending");
    expect(Number((await app.db("request_activities").where({ request_id: mine.id }).count({ n: "*" }).first()).n)).toBe(1);

    // a supervisor who also submits a request cannot decide it either (the approver needs requests.create to submit one)
    await app.db("role_permissions").insert({ role_id: (await app.db("users").where({ id: approver.userId }).first()).role_id, permission_key: "requests.create" });
    const sup = await create(approver, { title: "طلب المشرف" });
    expect((await send("POST", `/requests/${sup.id}/approve`, {}, approver.headers)).statusCode).toBe(403);
    expect((await send("POST", `/requests/${sup.id}/approve`, {}, admin.headers)).statusCode).toBe(200); // someone else decides
    expect((await notes(admin.userId)).some((n) => n.title === "تمت الموافقة على طلبك")).toBe(false);
  });
});

describe("request comments", () => {
  it("adds a comment shown in the detail with author name and role; notifies the requester", async () => {
    app = await testApp();
    const { requester, approver, admin } = await team();
    const r = await create(requester);
    const res = await send("POST", `/requests/${r.id}/comments`, { body: "  يرجى إرفاق عرض سعر  " }, approver.headers);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ body: "يرجى إرفاق عرض سعر", author: { name: "معتمد" } });

    const detail = (await get(`/requests/${r.id}`, admin.headers)).json().data;
    expect(detail.comments).toHaveLength(1);
    expect(detail.comments[0]).toMatchObject({ body: "يرجى إرفاق عرض سعر", author: { name: "معتمد", role: expect.stringContaining("role-") }, created_at: expect.stringMatching(/Z$/) });
    expect((await notes(requester.userId))[0].title).toBe("تعليق جديد على طلبك");

    await send("POST", `/requests/${r.id}/comments`, { body: "رد" }, requester.headers); // own comment: no self notification
    expect(await notes(requester.userId)).toHaveLength(1);
  });

  it("422 for an empty body, 404 for other organizations, 403 without requests.view", async () => {
    app = await testApp();
    const { requester, admin } = await team();
    const b = await otherOrg();
    const r = await create(requester);
    expect((await send("POST", `/requests/${r.id}/comments`, { body: "  " }, requester.headers)).statusCode).toBe(422);
    expect((await send("POST", `/requests/${r.id}/comments`, {}, requester.headers)).statusCode).toBe(422);
    expect((await send("POST", `/requests/${r.id}/comments`, { body: "x" }, b.headers)).statusCode).toBe(404);
    const none = await member(app, admin, { email: "none@org.org" });
    expect((await send("POST", `/requests/${r.id}/comments`, { body: "x" }, none.headers)).statusCode).toBe(403);
  });
});

describe("request attachments", () => {
  it("uploads, lists, and downloads as an attachment (Arabic file name preserved)", async () => {
    app = await testApp();
    const { requester, viewer } = await team();
    const r = await create(requester);
    const res = await upload(`/requests/${r.id}/attachments`, viewer.headers, [file("عرض سعر.pdf", PDF, "application/pdf")]);
    expect(res.statusCode).toBe(201);
    const att = res.json().data;
    expect(att).toMatchObject({ name: "عرض سعر.pdf", size: PDF.length, mime: "application/pdf" });

    const detail = (await get(`/requests/${r.id}`, requester.headers)).json().data;
    expect(detail.attachments).toEqual([expect.objectContaining({ id: att.id, name: "عرض سعر.pdf" })]);

    const dl = await get(`/requests/${r.id}/attachments/${att.id}/download`, requester.headers);
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.equals(PDF)).toBe(true);
    expect(dl.headers["content-type"]).toBe("application/pdf");
    expect(dl.headers["content-disposition"]).toMatch(/^attachment; filename=".*"; filename\*=UTF-8''/);
    expect(dl.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("DELETE removes the attachment and its file: its author, a supervisor or an admin may; other members get 403", async () => {
    app = await testApp();
    const { admin, requester, approver, viewer } = await team();
    const b = await otherOrg();
    const r1 = await create(requester);
    const r2 = await create(requester);
    const mine = (await upload(`/requests/${r1.id}/attachments`, requester.headers, [file("أ.txt")])).json().data;
    const url = `/requests/${r1.id}/attachments/${mine.id}`;
    expect(filesOnDisk(app)).toHaveLength(1);

    expect((await send("DELETE", url, undefined, viewer.headers)).statusCode).toBe(403); // sees it, did not attach it
    expect((await send("DELETE", url, undefined, b.headers)).statusCode).toBe(404); // another organization
    expect((await send("DELETE", `/requests/${r2.id}/attachments/${mine.id}`, undefined, requester.headers)).statusCode).toBe(404); // wrong request
    expect(filesOnDisk(app)).toHaveLength(1);

    expect((await send("DELETE", url, undefined, requester.headers)).statusCode).toBe(204);
    expect(filesOnDisk(app)).toHaveLength(0);
    expect((await get(`/requests/${r1.id}`, requester.headers)).json().data.attachments).toEqual([]);
    expect((await send("DELETE", url, undefined, requester.headers)).statusCode).toBe(404);
    expect(await app.db("audit_logs").where({ action: "attachment.deleted", entity_id: mine.id, actor_id: requester.userId })).toHaveLength(1);

    const again = (await upload(`/requests/${r1.id}/attachments`, requester.headers, [file("ب.txt")])).json().data;
    expect((await send("DELETE", `/requests/${r1.id}/attachments/${again.id}`, undefined, approver.headers)).statusCode).toBe(204); // supervisor
    const last = (await upload(`/requests/${r1.id}/attachments`, requester.headers, [file("ج.txt")])).json().data;
    expect((await send("DELETE", `/requests/${r1.id}/attachments/${last.id}`, undefined, admin.headers)).statusCode).toBe(204); // full access
    expect(filesOnDisk(app)).toHaveLength(0);
  });

  it("accepts any file type but decides html/text as non-previewable downloads", async () => {
    app = await testApp();
    const { requester } = await team();
    const r = await create(requester);
    const res = await upload(`/requests/${r.id}/attachments`, requester.headers, [file("page.html", "<script>alert(1)</script>", "text/html")]);
    expect(res.statusCode).toBe(201);
    const dl = await get(`/requests/${r.id}/attachments/${res.json().data.id}/download`, requester.headers);
    expect(dl.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(dl.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("404 for a missing request (no file is stored), other orgs, wrong attachment/request pairing", async () => {
    app = await testApp();
    const { requester } = await team();
    const b = await otherOrg();
    const r1 = await create(requester);
    const r2 = await create(requester);
    expect((await upload("/requests/999/attachments", requester.headers, [file()])).statusCode).toBe(404);
    expect(filesOnDisk(app)).toHaveLength(0);
    expect((await upload(`/requests/${r1.id}/attachments`, b.headers, [file()])).statusCode).toBe(404);

    const att = (await upload(`/requests/${r1.id}/attachments`, requester.headers, [file()])).json().data;
    expect((await get(`/requests/${r2.id}/attachments/${att.id}/download`, requester.headers)).statusCode).toBe(404); // belongs to r1
    expect((await get(`/requests/${r1.id}/attachments/${att.id}/download`, b.headers)).statusCode).toBe(404);
    expect((await get(`/requests/${r1.id}/attachments/999/download`, requester.headers)).statusCode).toBe(404);
  });

  it("422 without a file / wrong field; 413 above the size limit; capped at 20 per request", async () => {
    app = await testApp({ env: { MAX_UPLOAD_MB: "1" } });
    const { requester } = await team();
    const r = await create(requester);
    const url = `/requests/${r.id}/attachments`;
    expect((await send("POST", url, {}, requester.headers)).statusCode).toBe(422);
    expect((await upload(url, requester.headers, [file("a.txt", "x", "text/plain", "avatar")])).statusCode).toBe(422);
    expect((await upload(url, requester.headers, [file("big.bin", Buffer.alloc(1024 * 1024 + 10), "application/octet-stream")])).statusCode).toBe(413);
    expect(filesOnDisk(app)).toHaveLength(0);
    for (let i = 0; i < 20; i++) expect((await upload(url, requester.headers, [file(`f${i}.txt`)])).statusCode).toBe(201);
    const over = await upload(url, requester.headers, [file("21.txt")]);
    expect(over.statusCode).toBe(422);
    expect(filesOnDisk(app)).toHaveLength(20);
  });
});
