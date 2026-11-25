import { afterEach, describe, expect, it } from "vitest";
import { testApp, post, bearer, login, signedInAdmin, platformAdmin, registerVerified, PASSWORD } from "./helpers.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const NEW_PASSWORD = "N3w-Passw0rd!";
const change = (headers, payload) => post(app, "/auth/change-password", payload, headers);
const body = (over = {}) => ({ current_password: PASSWORD, password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD, ...over });

describe("POST /auth/change-password", () => {
  it("changes the password, keeps this session, ends the others, audits and e-mails the owner", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const other = (await login(app, admin.email)).json().token; // a second device

    const res = await change(admin.headers, body());
    expect(res.statusCode).toBe(200);
    expect(res.json().changed).toBe(true);

    // the session that made the request survives, every other one is gone
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: admin.headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: bearer(other) })).statusCode).toBe(401);

    // old password is dead, new one works
    expect((await login(app, admin.email, PASSWORD)).statusCode).toBe(401);
    expect((await login(app, admin.email, NEW_PASSWORD)).statusCode).toBe(200);

    const audit = await app.db("audit_logs").where({ organization_id: admin.organizationId, action: "auth.password_changed" });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: admin.userId, entity_type: "user", entity_id: admin.userId });
    expect(audit[0].meta).not.toContain(NEW_PASSWORD);
    expect(app.mailer.outbox.some((m) => m.to === admin.email && /تم تغيير كلمة مرور/.test(m.subject))).toBe(true);
  });

  it("rejects a wrong current password (422 on current_password) and leaves the password alone", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const res = await change(admin.headers, body({ current_password: "Wr0ng-pass!" }));
    expect(res.statusCode).toBe(422);
    expect(res.json().errors.current_password).toBeTruthy();
    expect((await login(app, admin.email, PASSWORD)).statusCode).toBe(200);
    expect(await app.db("audit_logs").where({ action: "auth.password_changed" })).toHaveLength(0);
  });

  it("validates the new password: policy, confirmation, and difference from the current one", async () => {
    app = await testApp();
    const admin = await signedInAdmin(app);
    const weak = await change(admin.headers, body({ password: "short", password_confirmation: "short" }));
    expect(weak.statusCode).toBe(422);
    expect(weak.json().errors.password).toBeTruthy();

    const mismatch = await change(admin.headers, body({ password_confirmation: "Different#1" }));
    expect(mismatch.statusCode).toBe(422);
    expect(mismatch.json().errors.password).toBeTruthy();

    const same = await change(admin.headers, body({ password: PASSWORD, password_confirmation: PASSWORD }));
    expect(same.statusCode).toBe(422);
    expect(same.json().errors.password).toBeTruthy();

    const missing = await change(admin.headers, { password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().errors.current_password).toBeTruthy();
  });

  it("requires a session", async () => {
    app = await testApp();
    expect((await change({}, body())).statusCode).toBe(401);
    expect((await change(bearer("mt_not-a-real-token"), body())).statusCode).toBe(401);
  });

  it("throttles wrong current-password guesses per user (5 per 15 minutes), even with the right one afterwards", async () => {
    app = await testApp({ env: { RATE_LIMIT_SCALE: "1" } });
    const admin = await signedInAdmin(app);
    for (let i = 0; i < 5; i++) {
      expect((await change(admin.headers, body({ current_password: `Wr0ng-pass-${i}!` }))).statusCode).toBe(422);
    }
    expect((await change(admin.headers, body())).statusCode).toBe(429);
    expect((await login(app, admin.email, PASSWORD)).statusCode).toBe(200); // the password did not change
  });

  it("works for an account whose organization is not approved yet", async () => {
    app = await testApp();
    const reg = await registerVerified(app); // organization still "incomplete"
    const token = (await login(app, reg.email)).json().token;
    expect((await change(bearer(token), body())).statusCode).toBe(200);
    expect((await login(app, reg.email, NEW_PASSWORD)).statusCode).toBe(200);
  });

  it("works for a platform operator (no organization, so no audit row)", async () => {
    app = await testApp();
    const ops = await platformAdmin(app);
    expect((await change(ops.headers, body())).statusCode).toBe(200);
    expect((await login(app, "ops@masar.io", NEW_PASSWORD)).statusCode).toBe(200);
    expect(await app.db("audit_logs").where({ action: "auth.password_changed" })).toHaveLength(0);
  });
});

describe("audit trail of operator decisions", () => {
  it("records approve / reject / suspend with the operator as actor and the reason", async () => {
    app = await testApp();
    const ops = await platformAdmin(app);
    const opsUser = await app.db("users").where({ email: "ops@masar.io" }).first("id");
    const reg = await registerVerified(app);
    const url = (action) => `/platform/organizations/${reg.organizationId}/${action}`;

    await app.db("organizations").where({ id: reg.organizationId }).update({ status: "pending_approval" });
    expect((await post(app, url("reject"), { reason: "وثائق ناقصة" }, ops.headers)).statusCode).toBe(200);
    expect((await post(app, url("approve"), {}, ops.headers)).statusCode).toBe(200);
    expect((await post(app, url("suspend"), { reason: "مخالفة" }, ops.headers)).statusCode).toBe(200);

    const rows = await app.db("audit_logs").where({ entity_type: "organization", entity_id: reg.organizationId }).orderBy("id");
    expect(rows.map((r) => r.action)).toEqual(["organization.rejected", "organization.approved", "organization.suspended"]);
    expect(rows.every((r) => r.actor_id === opsUser.id && r.organization_id === reg.organizationId)).toBe(true);
    expect(JSON.parse(rows[0].meta).reason).toBe("وثائق ناقصة");
    expect(JSON.parse(rows[2].meta).reason).toBe("مخالفة");
  });
});
