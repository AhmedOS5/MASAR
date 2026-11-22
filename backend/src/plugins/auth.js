// Bearer-token authentication + authorization guards.
//
//   preHandler: app.guard()                                   any signed-in user of an APPROVED organization
//   preHandler: app.guard({ permission: "requests.approve" }) … who also holds that permission
//   preHandler: app.guard({ allowUnapproved: true })          /auth/me, /logout, onboarding (org not approved yet)
//   preHandler: app.guard({ platformAdmin: true })            platform operators (no organization)
//
// Failure modes: 401 = no/invalid/expired token (the BFF then clears the cookie and sends the user to /login),
//                403 = signed in but not allowed.
import fp from "fastify-plugin";
import { forbidden, unauthorized } from "../lib/errors.js";
import { bearerFrom, hashToken } from "../lib/tokens.js";
import { iso, nowIso } from "../lib/time.js";
import { ORG_BLOCKED, USER_CONTEXT_COLUMNS, loadPermissions, toAuthContext, userContextQuery } from "../modules/auth/context.js";

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

async function plugin(app) {
  const { db } = app;
  app.decorateRequest("auth", null);

  async function authenticate(request) {
    if (request.auth) return request.auth;

    const token = bearerFrom(request);
    if (!token) throw unauthorized();

    const row = await userContextQuery(db)
      .join("auth_tokens as t", "t.user_id", "u.id")
      .where("t.token_hash", hashToken(token))
      .first(...USER_CONTEXT_COLUMNS, "t.id as token_id", "t.expires_at", "t.last_used_at");
    if (!row) throw unauthorized();

    if (new Date(iso(row.expires_at)) <= new Date()) {
      await db("auth_tokens").where({ id: row.token_id }).del();
      throw unauthorized();
    }
    // A deactivated user or a rejected/suspended organization loses access immediately.
    if (row.user_status !== "active" || ORG_BLOCKED.has(row.org_status)) throw unauthorized();

    const lastUsed = row.last_used_at ? new Date(iso(row.last_used_at)).getTime() : 0;
    if (Date.now() - lastUsed > TOUCH_INTERVAL_MS) {
      await db("auth_tokens").where({ id: row.token_id }).update({ last_used_at: nowIso() });
    }

    request.auth = toAuthContext(row, await loadPermissions(db, row), row.token_id);
    return request.auth;
  }

  app.decorate("authenticate", authenticate);

  app.decorate("guard", (opts = {}) =>
    async function guard(request) {
      const auth = await authenticate(request);

      if (opts.platformAdmin) {
        if (!auth.isPlatformAdmin) throw forbidden();
        return;
      }
      if (!opts.allowUnapproved) {
        // Business data always belongs to an approved organization; platform admins have none.
        if (auth.isPlatformAdmin || !auth.organizationId) throw forbidden();
        if (!auth.approved) {
          throw forbidden("حساب المنظمة لم يُعتمد بعد، لا يمكن الوصول إلى هذه الخدمة.");
        }
      }
      if (opts.permission && !auth.can(opts.permission)) throw forbidden();
    },
  );
}

export default fp(plugin, { name: "auth", dependencies: ["errors"] });
