import { forbidden } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { ALLOWED_DOCUMENT_MIMES, receiveUploads } from "../../lib/uploads.js";
import { onboardingSchema } from "./schema.js";

const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB each (matches the form's rule)

export default async function organizationRoutes(app) {
  const orgs = app.orgService;

  // Onboarding belongs to the organization's own administrator and happens BEFORE approval.
  const onboardingGuard = app.guard({ allowUnapproved: true });
  const requireOwnerAdmin = (auth) => {
    if (!auth.organizationId || !auth.isSystemAdmin) throw forbidden("إكمال بيانات المنظمة متاح لمدير النظام فقط.");
  };

  app.post("/organization/o", { preHandler: onboardingGuard }, async (request, reply) => {
    requireOwnerAdmin(request.auth);
    const input = parse(onboardingSchema, request.body);
    await orgs.submitOnboarding(request.auth, input);
    return reply.status(201).send({ ok: true, onboarding_status: "pending_approval", message: "تم استلام بيانات المنظمة وهي الآن قيد المراجعة." });
  });

  // The form sends the files in a second request, i.e. after the profile (status already pending_approval).
  app.post("/organization/documents", { preHandler: onboardingGuard }, async (request, reply) => {
    requireOwnerAdmin(request.auth);
    const { files } = await receiveUploads(request, {
      storage: app.storage,
      folder: `org-${request.auth.organizationId}/documents`,
      field: "documents",
      allowedMimes: ALLOWED_DOCUMENT_MIMES,
      maxBytes: DOCUMENT_MAX_BYTES,
      maxFiles: 10,
    });
    const stored = await orgs.storeDocuments(request.auth, files, app.storage);
    return reply.status(201).send({ stored });
  });
}
