// Test-only control plane for the end-to-end suite (scripts/e2e.mjs, e2e/ui.spec.mjs). It exists only when
// ENABLE_TEST_CONTROLS=true (refused in production by config/env.js) and mirrors the controls of scripts/mock-backend.mjs:
//   POST /__control/reset      restore the demo data, forget the request log and injected failures
//   GET  /__control/log        { log, registrations, onboarding }   every API request seen since the last reset
//   POST /__control/fail       { method?, path?, prefix?, status?, message?, times? }   fail matching requests N times
//   POST /__control/approve    { email }   approve that user's organization (what a platform operator would do)
//   GET  /__control/state      { users: {email: onboarding_status}, verified: [emails] }
//   GET  /__control/mail       { mail: [...] }   outgoing e-mails (the verification link is in there)
import fp from "fastify-plugin";
import { createLocalStorage } from "../lib/storage.js";
import { seedDemo, wipeData } from "../demo/seed.js";
import { ORG_BLOCKED, onboardingStatus } from "../modules/auth/context.js";

async function plugin(app) {
  const { db, config } = app;
  let log = [];
  let fails = [];
  const skip = (path) => path.startsWith("/__control");

  // Multipart bodies are parsed inside the handlers; they report what they received so the log can show it.
  app.decorate("onUploadParsed", (request, { fields, files }) => {
    if (request.testEntry) request.testEntry.body = { ...fields, __files: files.map((f) => f.name) };
  });
  app.decorateRequest("testEntry", null);

  app.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0];
    if (skip(path)) return;
    const entry = {
      method: request.method,
      path,
      ip: request.ip, // what the per-IP rate limits see (proves the real client address survives the Next.js proxy)
      auth: Boolean(request.headers.authorization),
      authorization: request.headers.authorization ?? null,
      body: request.isMultipart?.() ? {} : (request.body ?? {}),
    };
    log.push(entry);
    request.testEntry = entry;

    const fail = fails.find((f) => (!f.method || f.method === request.method) && (path === f.path || (f.prefix && path.startsWith(f.prefix))) && f.times > 0);
    if (fail) {
      fail.times -= 1;
      return reply.status(fail.status || 500).send({ message: fail.message || "Server Error" });
    }
  });

  async function reset() {
    log = [];
    fails = [];
    app.limiter.clear();
    app.mailer.outbox.length = 0;
    await wipeData(db, { uploadDir: config.uploadDir });
    await seedDemo(db, { storage: createLocalStorage(config.uploadDir), scryptLogN: config.SCRYPT_LOG_N });
  }

  app.post("/__control/reset", async () => {
    await reset();
    return { ok: true };
  });
  app.get("/__control/log", async () => ({
    log,
    registrations: log.filter((l) => l.method === "POST" && ["/auth/register", "/register-organization"].includes(l.path)).map((l) => l.body),
    onboarding: log.filter((l) => l.method === "POST" && l.path === "/organization/o").map((l) => l.body),
  }));
  app.post("/__control/fail", async (request) => {
    fails.push({ times: 1, ...(request.body ?? {}) });
    return { ok: true };
  });
  app.post("/__control/approve", async (request) => {
    const user = await db("users").where({ email: String(request.body?.email ?? "").toLowerCase() }).first("organization_id");
    if (user?.organization_id) {
      const org = await db("organizations").where({ id: user.organization_id }).first("status");
      if (org && !ORG_BLOCKED.has(org.status) && org.status !== "approved") {
        await db("organizations").where({ id: user.organization_id }).update({ status: "approved" });
      }
    }
    return { ok: true };
  });
  app.get("/__control/state", async () => {
    const rows = await db("users as u").leftJoin("organizations as o", "o.id", "u.organization_id").select("u.email", "u.is_platform_admin", "u.email_verified_at", "o.status as org_status");
    return {
      users: Object.fromEntries(rows.map((r) => [r.email, onboardingStatus(r)])),
      verified: rows.filter((r) => r.email_verified_at).map((r) => r.email),
    };
  });
  app.get("/__control/mail", async () => ({ mail: app.mailer.outbox }));

  // first start = fresh demo data too, so `node src/server.js` with the controls on is immediately usable
  app.addHook("onReady", reset);
}

export default fp(plugin, { name: "test-controls", dependencies: ["errors"] });
