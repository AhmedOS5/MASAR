// GET /options feeds every select box in the UI. PUT /options/{kind} (not in the frontend contract yet) lets an
// administrator maintain a list — e.g. `projects`, which has no other way to come into existence.
import { notFound } from "../../lib/errors.js";
import { parse, text, z } from "../../lib/validate.js";
import { visibleProjectIds } from "../projects/access.js";

export const OPTION_KINDS = [
  "departments", "request_types", "task_types", "projects", "sectors", "regions",
  "activity_types", "complaint_types", "channels", "report_types", "periods",
];

const MAX_VALUES = 200;
const valuesSchema = z.object({
  values: z.array(text(150)).max(MAX_VALUES).transform((v) => [...new Set(v)]),
});

export default async function lookupRoutes(app) {
  const { db } = app;

  async function load(auth) {
    const organizationId = auth.organizationId;
    const ids = await visibleProjectIds(db, auth);
    const live = db("projects").where({ organization_id: organizationId, status: "active" }).orderBy("id");
    const [rows, employees, projects] = await Promise.all([
      db("options").where({ organization_id: organizationId }).orderBy(["kind", "sort_order", "id"]).select("kind", "value", "label"),
      db("users").where({ organization_id: organizationId, status: "active" }).orderBy("name").select("id", "name"),
      (ids === null ? live : live.whereIn("id", ids)).pluck("name"),
    ]);
    const data = Object.fromEntries(OPTION_KINDS.map((k) => [k, []]));
    for (const r of rows) {
      if (data[r.kind]) data[r.kind].push(r.label ? { value: r.value, label: r.label } : r.value);
    }
    // `projects` = the project workspaces the person works in (what the MEAL forms offer) + any list kept by hand before projects existed
    data.projects = [...new Set([...data.projects, ...projects])];
    data.employees = employees.map((e) => ({ value: e.id, label: e.name }));
    return data;
  }

  app.get("/options", { preHandler: app.guard() }, async (request) => ({ data: await load(request.auth) }));

  app.put("/options/:kind", { preHandler: app.guard({ permission: "settings.manage" }) }, async (request) => {
    const { kind } = request.params;
    if (!OPTION_KINDS.includes(kind)) throw notFound();
    const { values } = parse(valuesSchema, request.body);
    const organization_id = request.auth.organizationId;
    await db.transaction(async (trx) => {
      await trx("options").where({ organization_id, kind }).del();
      if (values.length) await trx("options").insert(values.map((value, i) => ({ organization_id, kind, value, sort_order: i })));
    });
    return { data: values };
  });
}
