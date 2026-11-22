import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { testApp, post, bearer, register, registerVerified, login, signedInAdmin, registrationBody, otpFor, PASSWORD } from "./helpers.js";
import { hashPassword, verifyPassword } from "../src/lib/password.js";
import { hashToken, newToken } from "../src/lib/tokens.js";
import { PERMISSIONS } from "../src/modules/auth/permissions.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const nowIso = () => new Date().toISOString();

describe("password hashing", () => {
  it("round-trips, salts, and rejects wrong/odd input", async () => {
    const a = await hashPassword("Secret#123", { logN: 10 });
    const b = await hashPassword("Secret#123", { logN: 10 });
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$10\$8\$1\$/);
    expect(await verifyPassword("Secret#123", a)).toBe(true);
    expect(await verifyPassword("secret#123", a)).toBe(false);
    expect(await verifyPassword("x".repeat(500), a)).toBe(false);
    expect(await verifyPassword("Secret#123", "garbage")).toBe(false);
    expect(await verifyPassword("Secret#123", null)).toBe(false);
  });
});

describe("POST /auth/register", () => {
  it("creates org + admin + role + defaults, mails a 6-digit code (never returns it), returns 201", async () => {
    app = await testApp();
    const res = await register(app);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.message).toBeTruthy();
    expect(body.expires_in_minutes).toBe(15);
    expect(JSON.stringify(body)).not.toMatch(/[0-9]{6}/); // the code only travels by e-mail
    expect(body.verification_url).toBeUndefined();

    const org = await app.db("organizations").first();
    expect(org).toMatchObject({ name: "منظمة النور", type: "ngo", status: "incomplete", region: "غزة" });
    const user = await app.db("users").first();
    expect(user).toMatchObject({ email: "admin@org.org", status: "active", email_verified_at: null, organization_id: org.id });
    expect(user.password_hash).toMatch(/^scrypt[$]/);
    expect(user.password_hash).not.toContain(PASSWORD);
    const role = await app.db("roles").first();
    expect(role.is_system_admin).toBeTruthy();
    expect((await app.db("role_permissions").where({ role_id: role.id })).length).toBe(PERMISSIONS.length);
    expect((await app.db("options").where({ organization_id: org.id, kind: "departments" })).length).toBeGreaterThan(0);

    expect(app.mailer.outbox).toHaveLength(1);
    expect(app.mailer.outbox[0].to).toBe("admin@org.org");
    expect(otpFor(app, "admin@org.org")).toMatch(/^[0-9]{6}$/);
  });

  it("/register-organization is an alias of /auth/register", async () => {
    app = await testApp();
    const res = await post(app, "/register-organization", registrationBody());
    expect(res.statusCode).toBe(201);
    expect(otpFor(app, "admin@org.org")).toMatch(/^[0-9]{6}$/);
  });

  it("normalises e-mail case and organization_type casing", async () => {
    app = await testApp();
    await register(app, { admin_email: "  Admin@Org.ORG ", organization_type: "INGO" });
    expect((await app.db("users").first()).email).toBe("admin@org.org");
    expect((await app.db("organizations").first()).type).toBe("ingo");
  });

  it("validates every field with Laravel-shaped errors", async () => {
    app = await testApp();
    const res = await post(app, "/auth/register", {});
    expect(res.statusCode).toBe(422);
    const { message, errors } = res.json();
    expect(message).toBeTruthy();
    for (const f of ["organization_name", "organization_email", "admin_email", "organization_region", "organization_phone", "admin_password", "agreed_to_terms"]) {
      expect(errors[f], f).toEqual([expect.any(String)]);
    }
  });

  it.each([
    ["free-mail organization e-mail", { organization_email: "ngo@gmail.com" }, "organization_email"],
    ["free-mail with odd case", { organization_email: "NGO@Yahoo.com" }, "organization_email"],
    ["short password", { admin_password: "Ab1!", admin_password_confirmation: "Ab1!" }, "admin_password"],
    ["no digit", { admin_password: "Password!!", admin_password_confirmation: "Password!!" }, "admin_password"],
    ["no symbol", { admin_password: "Password11", admin_password_confirmation: "Password11" }, "admin_password"],
    ["mismatched confirmation", { admin_password_confirmation: "Different1!" }, "admin_password"],
    ["terms not accepted", { agreed_to_terms: false }, "agreed_to_terms"],
    ["bad admin e-mail", { admin_email: "not-an-email" }, "admin_email"],
    ["short phone", { organization_phone: "123" }, "organization_phone"],
    ["unknown organization type", { organization_type: "bank" }, "organization_type"],
  ])("rejects %s", async (_name, over, field) => {
    app = await testApp();
    const res = await post(app, "/auth/register", registrationBody(over));
    expect(res.statusCode).toBe(422);
    expect(res.json().errors[field]).toBeTruthy();
    expect(Number((await app.db("organizations").count({ n: "*" }).first()).n)).toBe(0);
  });

  it("allows a free-mail ADMIN address (only the organization address is restricted)", async () => {
    app = await testApp();
    expect((await register(app, { admin_email: "person@gmail.com" })).statusCode).toBe(201);
  });

  it("rejects a duplicate admin e-mail on admin_email, creating nothing", async () => {
    app = await testApp();
    await register(app);
    const res = await register(app, { organization_name: "Other", admin_email: "ADMIN@org.org" });
    expect(res.statusCode).toBe(422);
    expect(res.json().errors.admin_email).toBeTruthy();
    expect(Number((await app.db("organizations").count({ n: "*" }).first()).n)).toBe(1);
  });

  it("is rate limited per IP", async () => {
    app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await post(app, "/auth/register", {})).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 422)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe("POST /login", () => {
  it("returns { token, user } with onboarding_status for a verified user", async () => {
    app = await testApp();
    await registerVerified(app);
    const res = await login(app, "ADMIN@org.org");
    expect(res.statusCode).toBe(200);
    const { token, user } = res.json();
    expect(token).toMatch(/^mt_[A-Za-z0-9_-]{43}$/);
    expect(user).toMatchObject({ name: "admin", email: "admin@org.org", role: "مدير النظام", onboarding_status: "incomplete", is_system_admin: true });
    expect(user.permissions).toHaveLength(PERMISSIONS.length);
    expect(res.body).not.toContain("password");
  });

  it("stores only the SHA-256 of the token", async () => {
    app = await testApp();
    await registerVerified(app);
    const { token } = (await login(app)).json();
    const row = await app.db("auth_tokens").first();
    expect(row.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("reports onboarding_status per organization state", async () => {
    app = await testApp();
    const reg = await registerVerified(app);
    for (const [status, expected] of [["pending_approval", "pending_approval"], ["approved", "approved"]]) {
      await app.db("organizations").update({ status });
      expect((await login(app, reg.email)).json().user.onboarding_status).toBe(expected);
    }
  });

  it("401 with the same message for wrong password and unknown e-mail", async () => {
    app = await testApp();
    await registerVerified(app);
    const wrong = await login(app, "admin@org.org", "Wrong#pass1");
    const ghost = await login(app, "ghost@org.org", "Wrong#pass1");
    expect(wrong.statusCode).toBe(401);
    expect(ghost.statusCode).toBe(401);
    expect(wrong.json()).toEqual(ghost.json());
  });

  it("403 when the e-mail is not verified, but only after the password is right", async () => {
    app = await testApp();
    await register(app);
    expect((await login(app)).statusCode).toBe(403);
    expect((await login(app, "admin@org.org", "Wrong#pass1")).statusCode).toBe(401);
  });

  it("403 for inactive users and suspended/rejected organizations", async () => {
    app = await testApp();
    const reg = await registerVerified(app);
    await app.db("users").update({ status: "inactive" });
    expect((await login(app, reg.email)).statusCode).toBe(403);
    await app.db("users").update({ status: "active" });
    for (const status of ["suspended", "rejected"]) {
      await app.db("organizations").update({ status });
      expect((await login(app, reg.email)).statusCode, status).toBe(403);
    }
  });

  it("a blocked organization's 403 says why: its status and the operator's reason (only after the password was right)", async () => {
    app = await testApp();
    const reg = await registerVerified(app);
    for (const [status, reason] of [["suspended", "مخالفة الشروط"], ["rejected", "وثائق ناقصة"]]) {
      await app.db("organizations").update({ status, rejection_reason: reason });
      const res = await login(app, reg.email);
      expect(res.statusCode, status).toBe(403);
      expect(res.json()).toMatchObject({ organization_status: status, reason });
    }
    await app.db("organizations").update({ status: "suspended", rejection_reason: null });
    expect((await login(app, reg.email)).json()).toMatchObject({ organization_status: "suspended", reason: null });
    // a wrong password learns nothing about the organization
    const wrong = await login(app, reg.email, "Wrong#pass1");
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).not.toHaveProperty("organization_status");
  });

  it("employees without a password cannot log in", async () => {
    app = await testApp();
    const reg = await registerVerified(app);
    await app.db("users").insert({ organization_id: reg.organizationId, name: "E", email: "e@org.org", email_verified_at: nowIso() });
    expect((await login(app, "e@org.org", PASSWORD)).statusCode).toBe(401);
  });

  it("validates the body", async () => {
    app = await testApp();
    const res = await post(app, "/login", {});
    expect(res.statusCode).toBe(422);
    expect(res.json().errors.admin_email).toBeTruthy();
    expect(res.json().errors.admin_password).toBeTruthy();
  });

  it("locks an e-mail after repeated failures, even with the right password", async () => {
    app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
    await registerVerified(app);
    for (let i = 0; i < 5; i++) expect((await login(app, "admin@org.org", "Wrong#pass1")).statusCode).toBe(401);
    expect((await login(app)).statusCode).toBe(429);
    expect((await login(app, "other@org.org", PASSWORD)).statusCode).toBe(401); // other identities unaffected
  });

  it("a successful login clears earlier failures", async () => {
    app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
    await registerVerified(app);
    for (let i = 0; i < 4; i++) await login(app, "admin@org.org", "Wrong#pass1");
    expect((await login(app)).statusCode).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login(app, "admin@org.org", "Wrong#pass1")).statusCode).toBe(401);
  });

  it("updates last_login_at", async () => {
    app = await testApp();
    await registerVerified(app);
    await login(app);
    expect((await app.db("users").first()).last_login_at).toBeTruthy();
  });
});

describe("token authentication", () => {
  it("GET /auth/me returns user + organization (also under /api)", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    for (const url of ["/auth/me", "/api/auth/me"]) {
      const res = await app.inject({ url, headers: a.headers });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        user: { email: "admin@org.org", role: "مدير النظام", onboarding_status: "approved" },
        organization: { name: "منظمة النور", type: "ngo", email: "info@alnoor.org", phone: "+970591112222" },
      });
    }
  });

  it.each([
    ["no header", {}],
    ["wrong scheme", { authorization: "Basic abc" }],
    ["garbage token", { authorization: "Bearer nope" }],
    ["empty bearer", { authorization: "Bearer " }],
    ["random well-formed token", { authorization: `Bearer ${newToken()}` }],
  ])("401 for %s", async (_n, headers) => {
    app = await testApp();
    await signedInAdmin(app);
    const res = await app.inject({ url: "/auth/me", headers });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBeTruthy();
  });

  it("401 for an expired token (and the row is removed)", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    await app.db("auth_tokens").update({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect((await app.inject({ url: "/auth/me", headers: a.headers })).statusCode).toBe(401);
    expect(Number((await app.db("auth_tokens").count({ n: "*" }).first()).n)).toBe(0);
  });

  it("logout revokes only the presented token", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const second = (await login(app, a.email)).json().token;
    const out = await post(app, "/logout", undefined, a.headers);
    expect(out.statusCode).toBe(200);
    expect(out.json()).toEqual({ ok: true });
    expect((await app.inject({ url: "/auth/me", headers: a.headers })).statusCode).toBe(401);
    expect((await app.inject({ url: "/auth/me", headers: bearer(second) })).statusCode).toBe(200);
    expect((await post(app, "/logout", undefined, a.headers)).statusCode).toBe(401);
  });

  it("logout works with a JSON content-type and an empty body (generic HTTP clients)", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    const out = await app.inject({ method: "POST", url: "/logout", headers: { ...a.headers, "content-type": "application/json" } });
    expect(out.statusCode).toBe(200);
    expect((await app.inject({ url: "/auth/me", headers: a.headers })).statusCode).toBe(401);
  });

  it("rejects __proto__ poisoning in JSON bodies", async () => {
    app = await testApp();
    const res = await app.inject({
      method: "POST",
      url: "/login",
      headers: { "content-type": "application/json" },
      payload: '{"admin_email":"a@b.org","admin_password":"x","__proto__":{"admin":true}}',
    });
    expect(res.statusCode).toBe(400);
  });

  it("deactivating a user or suspending the org cuts live sessions immediately", async () => {
    app = await testApp();
    const a = await signedInAdmin(app);
    await app.db("users").update({ status: "inactive" });
    expect((await app.inject({ url: "/auth/me", headers: a.headers })).statusCode).toBe(401);
    await app.db("users").update({ status: "active" });
    expect((await app.inject({ url: "/auth/me", headers: a.headers })).statusCode).toBe(200);
    await app.db("organizations").update({ status: "suspended" });
    expect((await app.inject({ url: "/auth/me", headers: a.headers })).statusCode).toBe(401);
  });

  it("an unapproved org user can reach /auth/me and /logout", async () => {
    app = await testApp();
    const reg = await registerVerified(app);
    const { token } = (await login(app, reg.email)).json();
    expect((await app.inject({ url: "/auth/me", headers: bearer(token) })).json().user.onboarding_status).toBe("incomplete");
    expect((await post(app, "/logout", undefined, bearer(token))).statusCode).toBe(200);
  });

  it("hashToken is deterministic", () => {
    expect(hashToken("a")).toBe(hashToken("a"));
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});

describe("app.guard (authorization)", () => {
  const routes = (a) => {
    a.get("/__t/any", { preHandler: a.guard() }, async (r) => ({ org: r.auth.organizationId }));
    a.get("/__t/approve", { preHandler: a.guard({ permission: "requests.approve" }) }, async () => ({ ok: true }));
    a.get("/__t/open", { preHandler: a.guard({ allowUnapproved: true }) }, async () => ({ ok: true }));
    a.get("/__t/platform", { preHandler: a.guard({ platformAdmin: true }) }, async () => ({ ok: true }));
  };
  const get = (url, headers) => app.inject({ url, headers });

  it("blocks unapproved organizations from business routes (403) but not from open ones", async () => {
    app = await testApp({ extend: routes });
    const reg = await registerVerified(app);
    const h = bearer((await login(app, reg.email)).json().token);
    expect((await get("/__t/any", h)).statusCode).toBe(403);
    expect((await get("/__t/approve", h)).statusCode).toBe(403);
    expect((await get("/__t/open", h)).statusCode).toBe(200);
    expect((await get("/__t/any")).statusCode).toBe(401);
  });

  it("system admin passes every permission once approved", async () => {
    app = await testApp({ extend: routes });
    const a = await signedInAdmin(app);
    expect((await get("/__t/any", a.headers)).json().org).toBe(a.organizationId);
    expect((await get("/__t/approve", a.headers)).statusCode).toBe(200);
    expect((await get("/__t/platform", a.headers)).statusCode).toBe(403);
  });

  it("regular roles hold exactly the permissions they were given", async () => {
    app = await testApp({ extend: routes });
    const a = await signedInAdmin(app);
    const hash = await hashPassword(PASSWORD, { logN: 10 });
    const [{ id: roleId }] = await app.db("roles").insert({ organization_id: a.organizationId, title: "باحث" }, ["id"]);
    await app.db("role_permissions").insert([{ role_id: roleId, permission_key: "tasks.view" }, { role_id: roleId, permission_key: "not.a.real.key" }]);
    await app.db("users").insert({ organization_id: a.organizationId, role_id: roleId, name: "R", email: "r@org.org", password_hash: hash, email_verified_at: nowIso() });
    const res = await login(app, "r@org.org");
    expect(res.json().user.permissions).toEqual(["tasks.view"]); // unknown keys are ignored
    expect((await get("/__t/approve", bearer(res.json().token))).statusCode).toBe(403);
    expect((await get("/__t/any", bearer(res.json().token))).statusCode).toBe(200);

    await app.db("role_permissions").insert({ role_id: roleId, permission_key: "requests.approve" });
    expect((await get("/__t/approve", bearer(res.json().token))).statusCode).toBe(200);
  });

  it("a user without a role has no permissions", async () => {
    app = await testApp({ extend: routes });
    const a = await signedInAdmin(app);
    const hash = await hashPassword(PASSWORD, { logN: 10 });
    await app.db("users").insert({ organization_id: a.organizationId, name: "N", email: "n@org.org", password_hash: hash, email_verified_at: nowIso() });
    const h = bearer((await login(app, "n@org.org")).json().token);
    expect((await get("/__t/any", h)).statusCode).toBe(200);
    expect((await get("/__t/approve", h)).statusCode).toBe(403);
  });

  it("platform admins reach platform routes only; /auth/me works without an organization", async () => {
    app = await testApp({ extend: routes });
    const hash = await hashPassword(PASSWORD, { logN: 10 });
    await app.db("users").insert({ name: "Ops", email: "ops@masar.io", password_hash: hash, is_platform_admin: true, email_verified_at: nowIso() });
    const res = await login(app, "ops@masar.io");
    expect(res.json().user).toMatchObject({ role: "مشرف المنصة", onboarding_status: "approved" });
    const h = bearer(res.json().token);
    expect((await get("/__t/platform", h)).statusCode).toBe(200);
    expect((await get("/__t/any", h)).statusCode).toBe(403);
    expect((await get("/auth/me", h)).json().organization).toBeNull();
  });

  it("tenants are isolated: each token resolves to its own organization", async () => {
    app = await testApp({ extend: routes });
    const a = await signedInAdmin(app);
    const b = await signedInAdmin(app, { admin_email: "boss@other.org", organization_name: "B", organization_email: "x@other.org" });
    expect(a.organizationId).not.toBe(b.organizationId);
    expect((await get("/__t/any", a.headers)).json().org).toBe(a.organizationId);
    expect((await get("/__t/any", b.headers)).json().org).toBe(b.organizationId);
  });
});
