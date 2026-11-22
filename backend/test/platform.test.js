import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeProject, testApp, post, login, newcomer, platformAdmin, onboardingBody, multipart, PDF, PASSWORD, register, otpFor, member } from "./helpers.js";
import { BACKEND_ROOT } from "../src/config/env.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** A newcomer who finished onboarding (pending_approval), with one uploaded document. */
async function submitted(over = {}) {
  const a = await newcomer(app, over);
  await post(app, "/organization/o", onboardingBody(), a.headers);
  const m = multipart([{ name: "documents[]", filename: "ترخيص.pdf", type: "application/pdf", content: PDF }]);
  await app.inject({ method: "POST", url: "/organization/documents", payload: m.payload, headers: { ...a.headers, ...m.headers } });
  return a;
}
const get = (url, headers) => app.inject({ url, headers });
const decide = (ops, id, kind, body) => post(app, `/platform/organizations/${id}/${kind}`, body, ops.headers);
const status = async (a) => (await get("/auth/me", a.headers)).json().user?.onboarding_status;

describe("platform access control", () => {
  it("401 anonymous, 403 for an organization admin, 200 for a platform operator", async () => {
    app = await testApp();
    const a = await submitted();
    const ops = await platformAdmin(app);
    expect((await get("/platform/organizations")).statusCode).toBe(401);
    expect((await get("/platform/organizations", a.headers)).statusCode).toBe(403);
    expect((await post(app, `/platform/organizations/${a.organizationId}/approve`, {}, a.headers)).statusCode).toBe(403);
    expect((await get("/platform/organizations", ops.headers)).statusCode).toBe(200);
  });

  it("an organization admin cannot approve their own organization", async () => {
    app = await testApp();
    const a = await submitted();
    await post(app, `/platform/organizations/${a.organizationId}/approve`, {}, a.headers);
    expect(await status(a)).toBe("pending_approval");
  });
});

describe("review", () => {
  it("lists with filter, search and pagination meta", async () => {
    app = await testApp();
    await submitted();
    await submitted({ admin_email: "b@two.org", organization_name: "الأمل" });
    await newcomer(app, { admin_email: "c@three.org", organization_name: "غير مكتملة" });
    const ops = await platformAdmin(app);

    const all = (await get("/platform/organizations", ops.headers)).json();
    expect(all.meta).toMatchObject({ total: 3, current_page: 1 });
    expect(all.data[0].id).toBeGreaterThan(all.data[2].id); // newest first

    const pending = (await get("/platform/organizations?status=pending_approval", ops.headers)).json();
    expect(pending.meta.total).toBe(2);
    expect(pending.data.every((o) => o.status === "pending_approval")).toBe(true);
    expect(pending.data[0].admin).toMatchObject({ email: "b@two.org" });
    expect(pending.data[0].submitted_at).toMatch(/Z$/);

    expect((await get(`/platform/organizations?search=${encodeURIComponent("الأمل")}`, ops.headers)).json().meta.total).toBe(1);
    expect((await get("/platform/organizations?per_page=1&page=3", ops.headers)).json().data).toHaveLength(1);
  });

  it("detail includes the profile and documents; documents download as attachments", async () => {
    app = await testApp();
    const a = await submitted();
    const ops = await platformAdmin(app);
    const { data } = (await get(`/platform/organizations/${a.organizationId}`, ops.headers)).json();
    expect(data).toMatchObject({ id: a.organizationId, status: "pending_approval", email: "official@alnoor.org" });
    expect(data.profile).toMatchObject({ registration_number: "REG-123", sectors: ["water", "health"] });
    expect(data.profile).not.toHaveProperty("volunteers_count");
    expect(data.documents).toHaveLength(1);

    const dl = await get(`/platform/organizations/${a.organizationId}/documents/${data.documents[0].id}/download`, ops.headers);
    expect(dl.statusCode).toBe(200);
    expect(dl.headers["content-type"]).toBe("application/pdf");
    expect(dl.headers["content-disposition"]).toMatch(/^attachment; filename=".*"; filename\*=UTF-8''/);
    expect(dl.rawPayload.equals(PDF)).toBe(true);
  });

  it("404 for unknown ids, a non-numeric id, and a document of another organization", async () => {
    app = await testApp();
    const a = await submitted();
    const b = await submitted({ admin_email: "b@two.org", organization_name: "B" });
    const ops = await platformAdmin(app);
    expect((await get("/platform/organizations/9999", ops.headers)).statusCode).toBe(404);
    expect((await get("/platform/organizations/abc", ops.headers)).statusCode).toBe(404);
    const docOfB = (await app.db("attachments").where({ organization_id: b.organizationId }).first()).id;
    expect((await get(`/platform/organizations/${a.organizationId}/documents/${docOfB}/download`, ops.headers)).statusCode).toBe(404);
  });
});

describe("decisions", () => {
  it("approve: org becomes approved, user can use business routes, members are notified and mailed", async () => {
    app = await testApp();
    const a = await submitted();
    const ops = await platformAdmin(app);
    const before = app.mailer.outbox.length;

    const res = await decide(ops, a.organizationId, "approve", {});
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ status: "approved", approved_at: expect.any(String) });
    expect(await status(a)).toBe("approved");

    const n = await app.db("notifications").where({ organization_id: a.organizationId });
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ user_id: a.userId, type: "system" });
    expect(Boolean(n[0].is_read)).toBe(false);
    expect(app.mailer.outbox.length).toBe(before + 1);
    expect(app.mailer.outbox.at(-1)).toMatchObject({ to: "admin@org.org" });
    expect(app.mailer.outbox.at(-1).subject).toMatch(/اعتماد/);
    expect((await app.db("organizations").first()).approved_by).toBeTruthy();
  });

  it("approve is only valid from pending_approval / rejected / suspended", async () => {
    app = await testApp();
    const inc = await newcomer(app);
    const ops = await platformAdmin(app);
    expect((await decide(ops, inc.organizationId, "approve", {})).statusCode).toBe(409); // never submitted
    expect((await decide(ops, 9999, "approve", {})).statusCode).toBe(404);

    const sub = await submitted({ admin_email: "b@two.org", organization_name: "B" });
    expect((await decide(ops, sub.organizationId, "approve", {})).statusCode).toBe(200);
    expect((await decide(ops, sub.organizationId, "approve", {})).statusCode).toBe(409); // already approved
  });

  it("reject requires a reason; the org then cannot log in and the reason is mailed", async () => {
    app = await testApp();
    const a = await submitted();
    const ops = await platformAdmin(app);
    const missing = await decide(ops, a.organizationId, "reject", {});
    expect(missing.statusCode).toBe(422);
    expect(missing.json().errors.reason).toBeTruthy();
    expect(await status(a)).toBe("pending_approval");

    const res = await decide(ops, a.organizationId, "reject", { reason: "الوثائق غير مكتملة" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ status: "rejected", rejection_reason: "الوثائق غير مكتملة" });
    expect((await login(app, a.email)).statusCode).toBe(403);
    expect((await get("/auth/me", a.headers)).statusCode).toBe(401); // live session cut
    expect(app.mailer.outbox.at(-1).text).toContain("الوثائق غير مكتملة");
  });

  it("a rejected organization can later be approved (reactivated)", async () => {
    app = await testApp();
    const a = await submitted();
    const ops = await platformAdmin(app);
    await decide(ops, a.organizationId, "reject", { reason: "x" });
    const res = await decide(ops, a.organizationId, "approve", {});
    expect(res.json().data).toMatchObject({ status: "approved", rejection_reason: null });
    const again = await login(app, a.email);
    expect(again.statusCode).toBe(200);
    expect(again.json().user.onboarding_status).toBe("approved");
  });

  it("suspend only applies to approved organizations and cuts sessions; approve restores", async () => {
    app = await testApp();
    const a = await submitted();
    const ops = await platformAdmin(app);
    expect((await decide(ops, a.organizationId, "suspend", {})).statusCode).toBe(409); // still pending
    await decide(ops, a.organizationId, "approve", {});
    expect((await decide(ops, a.organizationId, "suspend", { reason: "مخالفة" })).json().data.status).toBe("suspended");
    expect((await get("/auth/me", a.headers)).statusCode).toBe(401);
    expect((await login(app, a.email)).statusCode).toBe(403);
    await decide(ops, a.organizationId, "approve", {});
    expect((await login(app, a.email)).statusCode).toBe(200);
  });

  it("only the decided organization is affected", async () => {
    app = await testApp();
    const a = await submitted();
    const b = await submitted({ admin_email: "b@two.org", organization_name: "B" });
    const ops = await platformAdmin(app);
    await decide(ops, a.organizationId, "approve", {});
    expect(await status(a)).toBe("approved");
    expect(await status(b)).toBe("pending_approval");
  });
});

describe("operator console", () => {
  it("GET /platform/stats counts organizations by status, employees and beneficiaries reached; operators only", async () => {
    app = await testApp();
    const a = await submitted();
    await submitted({ admin_email: "b@two.org", organization_name: "الأمل" });
    await newcomer(app, { admin_email: "c@three.org", organization_name: "غير مكتملة" });
    const ops = await platformAdmin(app);
    await decide(ops, a.organizationId, "approve");
    const project_id = await makeProject(app, a);
    await app.db("field_records").insert([
      { organization_id: a.organizationId, project_id, status: "submitted", total_beneficiaries: 40 },
      { organization_id: a.organizationId, project_id, status: "submitted", total_beneficiaries: 2 },
      { organization_id: a.organizationId, project_id, status: "draft", total_beneficiaries: 1000 }, // drafts never count
    ]);

    expect((await get("/platform/stats")).statusCode).toBe(401);
    expect((await get("/platform/stats", a.headers)).statusCode).toBe(403);
    const { data } = (await get("/platform/stats", ops.headers)).json();
    expect(data.organizations).toEqual({
      total: 3,
      by_status: { incomplete: 1, pending_approval: 1, approved: 1, rejected: 0, suspended: 0 },
    });
    expect(data.employees).toEqual({ total: 3, active: 3 }); // the operator belongs to no organization
    expect(data.beneficiaries_reached).toBe(42);
    expect(data.health).toMatchObject({ status: "ok", database: "ok" });
    expect(data.health.checked_at).toMatch(/Z$/);
  });

  it("list and detail carry employee and beneficiary counts per organization", async () => {
    app = await testApp();
    const a = await submitted();
    const ops = await platformAdmin(app);
    await decide(ops, a.organizationId, "approve");
    const admin = { organizationId: a.organizationId };
    await member(app, admin, { email: "m1@alnoor.org" });
    await app.db("field_records").insert({ organization_id: a.organizationId, project_id: await makeProject(app, a), status: "submitted", total_beneficiaries: 7 });

    const row = (await get("/platform/organizations", ops.headers)).json().data.find((o) => o.id === a.organizationId);
    expect(row).toMatchObject({ employees_count: 2, beneficiaries_reached: 7 });
    const { data } = (await get(`/platform/organizations/${a.organizationId}`, ops.headers)).json();
    expect(data).toMatchObject({ employees_count: 2, beneficiaries_reached: 7 });
  });

  it("detail shows the admin's verification state but never the code or its hash", async () => {
    app = await testApp();
    await register(app, { admin_email: "late@org.org" }); // registered, never verified
    const org = await app.db("users").where({ email: "late@org.org" }).first("organization_id");
    const ops = await platformAdmin(app);

    const res = await get(`/platform/organizations/${org.organization_id}`, ops.headers);
    const [acc] = res.json().data.admin_accounts;
    expect(acc).toMatchObject({ email: "late@org.org", verified: false, has_password: true });
    expect(acc.code).toMatchObject({ active: true, kind: "verification", attempts: 0 });
    expect(acc.code.expires_at).toMatch(/Z$/);
    const code = otpFor(app, "late@org.org");
    expect(res.body).not.toContain(code);
    expect(res.body).not.toMatch(/otp_hash|email_otp/);
  });

  it("resend-verification mails a fresh code to an unverified admin; refuses verified admins and unknown ids", async () => {
    app = await testApp();
    await register(app, { admin_email: "late@org.org" });
    const org = await app.db("users").where({ email: "late@org.org" }).first("organization_id");
    const ops = await platformAdmin(app);
    const before = app.mailer.outbox.filter((m) => m.to === "late@org.org").length;

    const r = await post(app, `/platform/organizations/${org.organization_id}/resend-verification`, {}, ops.headers);
    expect(r.statusCode).toBe(200);
    expect(app.mailer.outbox.filter((m) => m.to === "late@org.org").length).toBe(before + 1);
    // the new code works on the normal verification screen
    expect((await post(app, "/auth/verify-email", { email: "late@org.org", code: otpFor(app, "late@org.org") })).statusCode).toBe(200);

    expect((await post(app, `/platform/organizations/${org.organization_id}/resend-verification`, {}, ops.headers)).statusCode).toBe(409);
    expect((await post(app, "/platform/organizations/999999/resend-verification", {}, ops.headers)).statusCode).toBe(404);
  });

  it("resend-verification is for operators only and is capped per account", async () => {
    app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } }); // the suite runs with limits x1000; this test needs the real cap
    await register(app, { admin_email: "late@org.org" });
    const org = await app.db("users").where({ email: "late@org.org" }).first("organization_id");
    const outsider = await newcomer(app, { admin_email: "x@other.org", organization_name: "أخرى" });
    expect((await post(app, `/platform/organizations/${org.organization_id}/resend-verification`, {}, outsider.headers)).statusCode).toBe(403);

    const ops = await platformAdmin(app);
    const url = `/platform/organizations/${org.organization_id}/resend-verification`;
    const codes = [];
    for (let i = 0; i < 6; i += 1) codes.push((await post(app, url, {}, ops.headers)).statusCode);
    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    expect(codes[5]).toBe(429);
  });
});

describe("createPlatformAdmin", () => {
  it("creates a verified operator and enforces the password policy and uniqueness", async () => {
    app = await testApp();
    await expect(app.orgService.createPlatformAdmin({ email: "x@masar.io", name: "X", password: "weak" })).rejects.toMatchObject({ status: 422 });
    await expect(app.orgService.createPlatformAdmin({ email: "bad", name: "X", password: PASSWORD })).rejects.toMatchObject({ status: 422 });
    await expect(app.orgService.createPlatformAdmin({ email: "x@masar.io", name: " ", password: PASSWORD })).rejects.toMatchObject({ status: 422 });
    await app.orgService.createPlatformAdmin({ email: "X@Masar.io", name: "X", password: PASSWORD });
    await expect(app.orgService.createPlatformAdmin({ email: "x@masar.io", name: "X", password: PASSWORD })).rejects.toMatchObject({ status: 409 });
    const u = await app.db("users").first();
    expect(u).toMatchObject({ email: "x@masar.io", organization_id: null });
    expect(Boolean(u.is_platform_admin)).toBe(true);
    expect(u.email_verified_at).toBeTruthy();
  });
});

describe("CLI (scripts/cli.mjs)", () => {
  it("creates an operator and approves an organization against a real database file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "masar-cli-"));
    const env = { ...process.env, NODE_ENV: "test", SQLITE_PATH: path.join(dir, "cli.sqlite"), SCRYPT_LOG_N: "10", MAIL_TRANSPORT: "none", PLATFORM_ADMIN_PASSWORD: PASSWORD };
    const run = (...args) => execFileSync(process.execPath, [path.join(BACKEND_ROOT, "scripts", "cli.mjs"), ...args], { env, encoding: "utf8" });
    try {
      execFileSync(process.execPath, [path.join(BACKEND_ROOT, "scripts", "db.mjs"), "migrate"], { env });

      expect(run("create-platform-admin", "--email", "ops@masar.io", "--name", "Ops")).toMatch(/Platform admin #1 created: ops@masar.io/);
      expect(() => run("create-platform-admin", "--email", "ops@masar.io", "--name", "Ops")).toThrow();

      // an organization that already submitted onboarding
      const Database = (await import("better-sqlite3")).default;
      const db = new Database(env.SQLITE_PATH);
      db.prepare("insert into organizations (name, email, status) values ('Org', 'o@org.org', 'pending_approval')").run();
      db.close();

      expect(run("orgs", "--status", "pending_approval")).toMatch(/1 organization/);
      expect(() => run("reject", "1")).toThrow(); // --reason required
      expect(run("approve", "1")).toMatch(/#1 Org: approved/);
      expect(() => run("approve", "1")).toThrow(); // already approved
      expect(run("suspend", "1", "--reason", "test")).toMatch(/suspended/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000); // spawns several node processes
});
