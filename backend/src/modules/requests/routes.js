import { forbidden } from "../../lib/errors.js";
import { paramId, parse } from "../../lib/validate.js";
import { attachUploadedFile, removeAttachment, sendAttachment } from "../shared/attachments.js";
import { commentSchema, createRequestSchema, rejectSchema } from "./schema.js";

export default async function requestRoutes(app) {
  const requests = app.requestService;
  const tasks = app.taskService;
  const view = { preHandler: app.guard({ permission: "requests.view" }) };

  app.get("/requests", view, async (request) => requests.list(request.auth, request.query));

  app.post("/requests", { preHandler: app.guard({ permission: "requests.create" }) }, async (request, reply) => {
    const input = parse(createRequestSchema, request.body);
    return reply.status(201).send({ data: await requests.create(request.auth, input) });
  });

  app.get("/requests/:id", view, async (request) => ({ data: await requests.detail(request.auth, paramId(request.params.id)) }));

  app.post("/requests/:id/approve", { preHandler: app.guard({ permission: "requests.approve" }) }, async (request) => ({
    data: await requests.approve(request.auth, paramId(request.params.id)),
  }));

  app.post("/requests/:id/reject", { preHandler: app.guard({ permission: "requests.approve" }) }, async (request) => {
    const id = paramId(request.params.id);
    const { reason } = parse(rejectSchema, request.body);
    return { data: await requests.reject(request.auth, id, reason) };
  });

  // Anyone who can see a request may discuss it and attach files to it.
  app.post("/requests/:id/comments", view, async (request, reply) => {
    const id = paramId(request.params.id);
    const { body } = parse(commentSchema, request.body);
    return reply.status(201).send({ data: await requests.addComment(request.auth, id, body) });
  });

  app.post("/requests/:id/attachments", view, async (request, reply) => {
    const id = paramId(request.params.id);
    await requests.assertExists(request.auth, id); // 404 before any bytes are read
    const data = await attachUploadedFile(app, request, { type: "request", id });
    return reply.status(201).send({ data });
  });

  app.get("/requests/:id/attachments/:aid/download", view, async (request, reply) => {
    const id = paramId(request.params.id);
    await requests.assertExists(request.auth, id); // outside the project's team: 404
    return sendAttachment(app, reply, request.auth, { type: "request", id, attachmentId: paramId(request.params.aid) });
  });

  app.delete("/requests/:id/attachments/:aid", view, async (request, reply) => {
    const id = paramId(request.params.id);
    await requests.assertExists(request.auth, id); // outside the project's team: 404
    await removeAttachment(app, request.auth, { type: "request", id, attachmentId: paramId(request.params.aid) });
    return reply.status(204).send();
  });

  app.post("/requests/:id/tasks", { preHandler: app.guard({ permission: "tasks.create" }) }, async (request, reply) => {
    if (!request.auth.can("requests.view")) throw forbidden();
    return reply.status(201).send({ data: await tasks.createFromRequest(request.auth, paramId(request.params.id)) });
  });
}
