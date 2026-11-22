// Platform operators (MASAR staff): review and decide on organizations, from the /operator console, curl or the CLI
// (scripts/cli.mjs). Every route requires is_platform_admin. Activating a suspended / rejected organization = approve.
import { paramId, parse } from "../../lib/validate.js";
import { sendStored } from "../../lib/http-files.js";
import { platformListSchema, reasonSchema, rejectSchema } from "../organizations/schema.js";

export default async function platformRoutes(app) {
  const orgs = app.orgService;
  const guard = { preHandler: app.guard({ platformAdmin: true }) };

  app.get("/platform/stats", guard, async () => ({ data: await orgs.stats() }));

  app.get("/platform/organizations", guard, async (request) => {
    const q = parse(platformListSchema, request.query);
    return orgs.list({ ...request.query, status: q.status });
  });

  app.get("/platform/organizations/:id", guard, async (request) => ({ data: await orgs.detail(paramId(request.params.id)) }));

  app.get("/platform/organizations/:id/documents/:docId/download", guard, async (request, reply) => {
    const doc = await orgs.document(paramId(request.params.id), paramId(request.params.docId));
    return sendStored(reply, app.storage, doc);
  });

  app.post("/platform/organizations/:id/approve", guard, async (request) => ({
    data: await orgs.decide(paramId(request.params.id), "approve", { actorId: request.auth.userId }),
  }));

  app.post("/platform/organizations/:id/reject", guard, async (request) => {
    const { reason } = parse(rejectSchema, request.body);
    return { data: await orgs.decide(paramId(request.params.id), "reject", { actorId: request.auth.userId, reason }) };
  });

  app.post("/platform/organizations/:id/resend-verification", guard, async (request) => ({
    data: await orgs.resendAdminVerification(paramId(request.params.id)),
  }));

  app.post("/platform/organizations/:id/suspend", guard, async (request) => {
    const { reason } = parse(reasonSchema, request.body);
    return { data: await orgs.decide(paramId(request.params.id), "suspend", { actorId: request.auth.userId, reason }) };
  });
}
