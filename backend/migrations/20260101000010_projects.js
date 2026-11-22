// Projects: each project is a workspace of its own. The system admin creates it and assigns employees and supervisors;
// requests, tasks, folders/reports and the beneficiaries' registry then live inside it.
// `project_id` on the existing tables is NULLABLE on purpose: rows that predate projects (and organizations that do not use
// them yet) stay organization-wide and keep working; only rows that belong to a project are restricted to its team.
import { nowDefault, tenant, timestamps, userRef } from "../src/db/schema-helpers.js";

const projectRef = (t, onDelete = "SET NULL") => t.integer("project_id").unsigned().references("id").inTable("projects").onDelete(onDelete);

export async function up(knex) {
  await knex.schema.createTable("projects", (t) => {
    t.increments("id");
    tenant(t);
    t.string("code", 30).notNullable();
    t.string("name").notNullable();
    t.text("description");
    t.string("status", 20).notNullable().defaultTo("active"); // active | completed | archived
    t.date("start_date");
    t.date("end_date");
    userRef(t, "created_by");
    timestamps(knex, t);
    t.unique(["organization_id", "code"]);
    t.index(["organization_id", "status"]);
  });

  // Who works on the project. project_role: supervisor (approves requests, directs others' tasks) | member.
  await knex.schema.createTable("project_members", (t) => {
    t.integer("project_id").unsigned().notNullable().references("id").inTable("projects").onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("project_role", 20).notNullable().defaultTo("member");
    t.timestamp("created_at").notNullable().defaultTo(nowDefault(knex));
    t.primary(["project_id", "user_id"]);
    t.index("user_id");
  });

  // The beneficiaries' registry of a project. Personal data: only people with beneficiaries.* inside the team can read it.
  await knex.schema.createTable("beneficiaries", (t) => {
    t.increments("id");
    tenant(t);
    projectRef(t, "CASCADE");
    t.string("code", 30).notNullable();
    t.string("full_name").notNullable();
    t.string("national_id", 30);
    t.string("gender", 10); // male | female
    t.date("birth_date");
    t.string("phone", 50);
    t.string("region");
    t.string("address", 500);
    t.integer("household_size");
    t.text("notes");
    t.string("status", 20).notNullable().defaultTo("active"); // active | inactive
    userRef(t, "created_by");
    timestamps(knex, t);
    t.unique(["organization_id", "code"]);
    t.unique(["project_id", "national_id"]); // NULL ids are distinct: only a real repeated id is a duplicate
    t.index(["project_id", "status"]);
  });

  await knex.schema.alterTable("requests", (t) => {
    projectRef(t);
    t.index(["organization_id", "project_id"]);
  });
  await knex.schema.alterTable("tasks", (t) => {
    projectRef(t);
    t.index(["organization_id", "project_id"]);
  });
  await knex.schema.alterTable("folders", (t) => {
    projectRef(t);
    t.dropUnique(["organization_id", "name"]); // the same folder name may exist in different projects (checked in code)
  });
  await knex.schema.alterTable("reports", (t) => {
    projectRef(t);
    t.integer("folder_id").unsigned().references("id").inTable("folders").onDelete("SET NULL");
    t.index(["organization_id", "folder_id"]);
  });
}

export async function down(knex) {
  await knex.schema.alterTable("reports", (t) => {
    t.dropIndex(["organization_id", "folder_id"]);
    t.dropColumn("folder_id");
    t.dropColumn("project_id");
  });
  await knex.schema.alterTable("folders", (t) => {
    t.dropColumn("project_id");
    t.unique(["organization_id", "name"]);
  });
  await knex.schema.alterTable("tasks", (t) => {
    t.dropIndex(["organization_id", "project_id"]);
    t.dropColumn("project_id");
  });
  await knex.schema.alterTable("requests", (t) => {
    t.dropIndex(["organization_id", "project_id"]);
    t.dropColumn("project_id");
  });
  await knex.schema.dropTableIfExists("beneficiaries");
  await knex.schema.dropTableIfExists("project_members");
  await knex.schema.dropTableIfExists("projects");
}
