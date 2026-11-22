// Application factory. Tests call buildApp({ env, db }) with an in-memory database; server.js uses the real one.
// buildApp() does NOT call app.ready() so callers (and tests) may still register routes.
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import errors from "./plugins/errors.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./modules/auth/routes.js";
import { createAuthService } from "./modules/auth/service.js";
import { createMailer } from "./lib/mailer.js";
import { createLimiter } from "./lib/limiter.js";
import { createLocalStorage } from "./lib/storage.js";
import { createOrganizationService } from "./modules/organizations/service.js";
import organizationRoutes from "./modules/organizations/routes.js";
import platformRoutes from "./modules/platform/routes.js";
import lookupRoutes from "./modules/lookups/routes.js";
import unitRoutes from "./modules/units/routes.js";
import notificationRoutes from "./modules/notifications/routes.js";
import dashboardRoutes from "./modules/dashboard/routes.js";
import { createRequestService } from "./modules/requests/service.js";
import requestRoutes from "./modules/requests/routes.js";
import { createTaskService } from "./modules/tasks/service.js";
import taskRoutes from "./modules/tasks/routes.js";
import { createPeopleService } from "./modules/people/service.js";
import peopleRoutes from "./modules/people/routes.js";
import projectRoutes from "./modules/projects/routes.js";
import fileRoutes from "./modules/files/routes.js";
import reportRoutes from "./modules/reports/routes.js";
import mealRoutes from "./modules/meal/routes.js";
import healthRoutes from "./modules/health/routes.js";
import testControls from "./testing/controls.js";

export async function buildApp({ env, db, logger } = {}) {
  const app = Fastify({
    logger:
      logger ??
      (env.isTest
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: ["req.headers.authorization", "req.headers.cookie"],
          }),
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1024 * 1024, // 1 MiB for JSON; uploads use multipart limits below
    // The frontend's API_URL may end in /api; both `/api/login` and `/login` reach the same route.
    rewriteUrl: (req) => req.url.replace(/^\/api(?=[/?]|$)/, "") || "/",
  });

  app.decorate("config", env);
  app.decorate("db", db);
  app.decorate("mailer", createMailer(env, app.log));
  app.decorate("limiter", createLimiter());
  app.decorate("storage", createLocalStorage(env.uploadDir));
  app.addHook("onClose", async () => {
    app.limiter.close();
    await db.destroy();
  });

  // Clients (axios, curl -H json, …) often send `content-type: application/json` with an empty body
  // on bodyless POSTs such as /logout. Treat that as "no body" instead of failing with 400.
  // Everything else keeps Fastify's secure parser (prototype-poisoning protection, 400 on bad JSON).
  const secureJson = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    if (body === "") return done(null, undefined);
    secureJson(request, body, done);
  });

  await app.register(errors);
  await app.register(helmet, { contentSecurityPolicy: false }); // JSON API: no HTML to protect
  // global:false => limits are opted into per route (login, register, resend-verification …).
  await app.register(rateLimit, { global: false });
  await app.register(multipart, {
    limits: { fileSize: env.maxUploadBytes, files: 10, fields: 50, parts: 70 },
  });

  // Every response is dynamic user data.
  app.addHook("onSend", async (request, reply) => {
    if (!reply.hasHeader("cache-control")) reply.header("cache-control", "no-store");
  });

  await app.register(authPlugin);
  if (env.ENABLE_TEST_CONTROLS) await app.register(testControls); // before the routes: its hooks must cover them
  app.decorate("authService", createAuthService(app));
  app.decorate("orgService", createOrganizationService(app));
  app.decorate("peopleService", createPeopleService(app));
  app.decorate("requestService", createRequestService(app));
  app.decorate("taskService", createTaskService(app));

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(organizationRoutes);
  await app.register(platformRoutes);
  await app.register(lookupRoutes);
  await app.register(unitRoutes);
  await app.register(notificationRoutes);
  await app.register(dashboardRoutes);
  await app.register(requestRoutes);
  await app.register(taskRoutes);
  await app.register(peopleRoutes);
  await app.register(projectRoutes);
  await app.register(fileRoutes);
  await app.register(reportRoutes);
  await app.register(mealRoutes);

  return app;
}
