import { paramId, parse } from "../../lib/validate.js";
import { createEmployeeSchema, createRoleSchema, updateEmployeeSchema, updateRoleSchema } from "./schema.js";

export default async function peopleRoutes(app) {
  const people = app.peopleService;
  const can = (permission) => ({ preHandler: app.guard({ permission }) });

  // ---------------------------------------------------------------- employees
  app.get("/employees", can("employees.view"), async (request) => people.listEmployees(request.auth, request.query));

  app.post("/employees", can("employees.manage"), async (request, reply) => {
    const input = parse(createEmployeeSchema, request.body);
    return reply.status(201).send({ data: await people.createEmployee(request.auth, input) });
  });

  app.put("/employees/:id", can("employees.manage"), async (request) => {
    const id = paramId(request.params.id);
    const input = parse(updateEmployeeSchema, request.body);
    return { data: await people.updateEmployee(request.auth, id, input) };
  });

  // Who assigned / changed this employee's role, and when (newest first).
  app.get("/employees/:id/audit", can("employees.view"), async (request) => people.employeeAudit(request.auth, paramId(request.params.id)));

  // The job category -> default role -> permissions mapping used for automatic role assignment.
  app.get("/job-categories", can("employees.view"), async () => people.jobCategories());

  // (Re-)send the invitation code to an employee who has not chosen a password yet.
  app.post("/employees/:id/invite", can("employees.manage"), async (request) => people.resendInvite(request.auth, paramId(request.params.id)));

  app.delete("/employees/:id", can("employees.manage"), async (request, reply) => {
    await people.deleteEmployee(request.auth, paramId(request.params.id));
    return reply.status(204).send();
  });

  // -------------------------------------------------------------------- roles
  app.get("/roles", can("roles.view"), async (request) => people.listRoles(request.auth));
  app.get("/permissions", can("roles.view"), async () => people.permissions());

  app.post("/roles", can("roles.manage"), async (request, reply) => {
    const input = parse(createRoleSchema, request.body);
    return reply.status(201).send({ data: await people.createRole(request.auth, input) });
  });

  app.put("/roles/:id", can("roles.manage"), async (request) => {
    const id = paramId(request.params.id);
    const input = parse(updateRoleSchema, request.body);
    return { data: await people.updateRole(request.auth, id, input) };
  });
}
