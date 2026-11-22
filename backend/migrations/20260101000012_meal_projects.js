// MEAL data belongs to a project, like everything else: indicators, complaints, field records and MEAL reports get a
// mandatory `project_id` and lose the free-text `project` column.
//
// The old text names become real projects: a name that matches an existing project of the organization (any case) is
// linked to it, any other name creates a new active project (no team yet, so only the system admin reaches it until a
// team is built). Nothing is deleted.
//
// Not transactional on purpose (see migration …11): SQLite rebuilds a table to change a column, which needs
// `PRAGMA foreign_keys = OFF`, a no-op inside a transaction.
import { nextCode } from "../src/lib/sequence.js";

export const config = { transaction: false };

const TABLES = ["indicators", "complaints", "meal_reports", "field_records"];
const isPg = (knex) => knex.client.config.client === "pg";

async function linkOrCreateProjects(knex, table) {
  const link = () =>
    knex(table).whereNull("project_id").update({
      project_id: knex.raw("(select p.id from projects p where p.organization_id = ??.organization_id and lower(p.name) = lower(??.project))", [table, table]),
    });
  await link();

  // names without a project yet -> create one per (organization, name), then link again
  const missing = await knex(table).whereNull("project_id").whereNotNull("project").where("project", "<>", "").distinct("organization_id", "project");
  for (const { organization_id, project } of missing) {
    const name = String(project).trim();
    const exists = await knex("projects").where({ organization_id }).whereRaw("lower(name) = ?", [name.toLowerCase()]).first("id");
    if (exists) continue;
    const code = await nextCode(knex, organization_id, "project", "PRJ");
    await knex("projects").insert({ organization_id, code, name, status: "active" });
  }
  await link();

  // rows that never had a project name at all (the old column allowed it): park them in one project per organization
  const nameless = await knex(table).whereNull("project_id").distinct("organization_id");
  for (const { organization_id } of nameless) {
    const name = "مشروع بلا اسم";
    let p = await knex("projects").where({ organization_id, name }).first("id");
    if (!p) {
      const code = await nextCode(knex, organization_id, "project", "PRJ");
      [p] = await knex("projects").insert({ organization_id, code, name, status: "active" }, ["id"]);
    }
    await knex(table).where({ organization_id }).whereNull("project_id").update({ project_id: p.id });
  }
}

async function setRequired(knex, table, required) {
  if (isPg(knex)) {
    await knex.raw("alter table ?? drop constraint if exists ??", [table, `${table}_project_id_foreign`]);
    await knex.raw(`alter table ?? alter column project_id ${required ? "set" : "drop"} not null`, [table]);
    await knex.raw(`alter table ?? add constraint ?? foreign key (project_id) references projects (id) on delete ${required ? "cascade" : "set null"}`, [table, `${table}_project_id_foreign`]);
    return;
  }
  await knex.schema.alterTable(table, (t) => t.dropForeign(["project_id"]));
  await knex.schema.alterTable(table, (t) => {
    const col = t.integer("project_id").unsigned();
    if (required) col.notNullable();
    else col.nullable();
    col.references("id").inTable("projects").onDelete(required ? "CASCADE" : "SET NULL").alter();
  });
}

export async function up(knex) {
  for (const table of TABLES) {
    await knex.schema.alterTable(table, (t) => {
      t.integer("project_id").unsigned().references("id").inTable("projects").onDelete("SET NULL");
    });
    await linkOrCreateProjects(knex, table);
  }
  if (!isPg(knex)) await knex.raw("PRAGMA foreign_keys = OFF");
  try {
    for (const table of TABLES) {
      await setRequired(knex, table, true);
      await knex.schema.alterTable(table, (t) => t.dropColumn("project"));
      await knex.schema.alterTable(table, (t) => t.index(["organization_id", "project_id"]));
    }
  } finally {
    if (!isPg(knex)) await knex.raw("PRAGMA foreign_keys = ON");
  }
}

export async function down(knex) {
  if (!isPg(knex)) await knex.raw("PRAGMA foreign_keys = OFF");
  try {
    for (const table of TABLES) {
      await knex.schema.alterTable(table, (t) => t.dropIndex(["organization_id", "project_id"]));
      await knex.schema.alterTable(table, (t) => t.string("project"));
      await knex(table).update({ project: knex.raw("(select p.name from projects p where p.id = ??.project_id)", [table]) });
      await setRequired(knex, table, false);
      await knex.schema.alterTable(table, (t) => t.dropColumn("project_id"));
    }
  } finally {
    if (!isPg(knex)) await knex.raw("PRAGMA foreign_keys = ON");
  }
}
