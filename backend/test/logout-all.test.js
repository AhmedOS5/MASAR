import { afterEach, describe, expect, it } from "vitest";
import { testApp, post, bearer, login, member, signedInAdmin, platformAdmin } from "./helpers.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const me = (headers) => app.inject({ method: "GET", url: "/auth/me", headers });

describe("POST /auth/logout-all", () => {
  it("ends every session of the caller (this one too), leaves other users alone and writes an audit row", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const phone = (await login(app, admin.email)).json().token; // a second device
    const colleague = await member(app, admin, { email: "c@org.org" });

    const res = await post(app, "/auth/logout-all", {}, admin.headers);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, sessions_ended: 2 });

    expect((await me(admin.headers)).statusCode).toBe(401);
    expect((await me(bearer(phone))).statusCode).toBe(401);
    expect((await me(colleague.headers)).statusCode).toBe(200);
    expect((await login(app, admin.email)).statusCode).toBe(200); // signing in again still works

    const audit = await app.db("audit_logs").where({ action: "auth.logout_all" });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entity_type: "user", entity_id: admin.userId, actor_id: admin.userId, organization_id: admin.organizationId });
  });

  it("needs a session; a platform operator can use it too (no tenant, so no audit row)", async () => {
    app = await testApp();
    expect((await post(app, "/auth/logout-all", {}, {})).statusCode).toBe(401);
    const op = await platformAdmin(app);
    const res = await post(app, "/auth/logout-all", {}, op.headers);
    expect(res.statusCode).toBe(200);
    expect((await me(op.headers)).statusCode).toBe(401);
    expect(await app.db("audit_logs").where({ action: "auth.logout_all" })).toHaveLength(0);
  });
});
