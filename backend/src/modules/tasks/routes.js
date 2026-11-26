import { paramId, parse } from "../../lib/validate.js";
import { attachUploadedFile, removeAttachment, sendAttachment } from "../shared/attachments.js";
import { commentSchema } from "../requests/schema.js";
import { createTaskSchema, updateTaskSchema } from "./schema.js";

export default async function taskRoutes(app) {
  const tasks = app.taskService;
  const view = { preHandler: app.guard({ permission: "tasks.view" }) };

  app.get("/tasks", view, async (request) => tasks.list(request.auth, request.query));

  app.post("/tasks", { preHandler: app.guard({ permission: "tasks.create" }) }, async (request, reply) => {
    const input = parse(createTaskSchema, request.body);
    return reply.status(201).send({ data: await tasks.create(request.auth, input) });
  });

  app.get("/tasks/:id", view, async (request) => ({ data: await tasks.detail(request.auth, paramId(request.params.id)) }));

  // `tasks.update` edits anything; the assignee alone may change status/progress of their own task (checked in the service).
  app.patch("/tasks/:id", view, async (request) => {
    const id = paramId(request.params.id);
    const input = parse(updateTaskSchema, request.body);
    return { data: await tasks.update(request.auth, id, input) };
  });

  app.post("/tasks/:id/comments", view, async (request, reply) => {
    const id = paramId(request.params.id);
    const { body } = parse(commentSchema, request.body);
    return reply.status(201).send({ data: await tasks.addComment(request.auth, id, body) });
  });

  app.post("/tasks/:id/attachments", view, async (request, reply) => {
    const id = paramId(request.params.id);
    await tasks.assertExists(request.auth, id);
    const data = await attachUploadedFile(app, request, { type: "task", id });
    return reply.status(201).send({ data });
  });

  app.get("/tasks/:id/attachments/:aid/download", view, async (request, reply) => {
    const id = paramId(request.params.id);
    await tasks.assertExists(request.auth, id); // outside the project's team: 404
    return sendAttachment(app, reply, request.auth, { type: "task", id, attachmentId: paramId(request.params.aid) });
  });

  app.delete("/tasks/:id/attachments/:aid", view, async (request, reply) => {
    const id = paramId(request.params.id);
    await tasks.assertExists(request.auth, id); // outside the project's team: 404
    await removeAttachment(app, request.auth, { type: "task", id, attachmentId: paramId(request.params.aid) });
    return reply.status(204).send();
  });
}
