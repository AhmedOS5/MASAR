// Core workspace: requests, tasks, attachments, notifications, files, reports, units.
import { timestamps, tenant, userRef, nowDefault } from "../src/db/schema-helpers.js";

export async function up(knex) {
  await knex.schema.createTable("requests", (t) => {
    t.increments("id");
    tenant(t);
    t.string("code", 30).notNullable();
    t.string("title").notNullable();
    t.string("status", 20).notNullable().defaultTo("pending"); // draft pending approved in_progress completed rejected
    t.string("priority", 20).notNullable().defaultTo("medium"); // low medium high urgent
    t.string("type");
    t.string("department");
    t.text("description");
    t.decimal("amount", 14, 2);
    userRef(t, "requester_id");
    userRef(t, "decided_by");
    t.timestamp("decided_at");
    t.text("rejection_reason");
    timestamps(knex, t);
    t.unique(["organization_id", "code"]);
    t.index(["organization_id", "status"]);
    t.index(["organization_id", "priority"]);
    t.index(["organization_id", "created_at"]);
  });

  await knex.schema.createTable("request_comments", (t) => {
    t.increments("id");
    t.integer("request_id").unsigned().notNullable().references("id").inTable("requests").onDelete("CASCADE");
    userRef(t, "author_id");
    t.text("body").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(nowDefault(knex));
    t.index("request_id");
  });

  await knex.schema.createTable("request_activities", (t) => {
    t.increments("id");
    t.integer("request_id").unsigned().notNullable().references("id").inTable("requests").onDelete("CASCADE");
    userRef(t, "actor_id");
    t.string("text").notNullable();
    t.string("kind", 20).notNullable(); // created reviewed pending rejected
    t.timestamp("created_at").notNullable().defaultTo(nowDefault(knex));
    t.index("request_id");
  });

  await knex.schema.createTable("tasks", (t) => {
    t.increments("id");
    tenant(t);
    t.string("code", 30).notNullable();
    t.string("title").notNullable();
    t.text("description");
    t.string("status", 20).notNullable().defaultTo("todo"); // todo in_progress blocked done
    t.string("priority", 20).notNullable().defaultTo("medium");
    t.string("department");
    t.string("type");
    userRef(t, "assignee_id");
    userRef(t, "creator_id");
    t.date("due_date");
    t.integer("progress").notNullable().defaultTo(0); // 0-100
    t.integer("request_id").unsigned().references("id").inTable("requests").onDelete("SET NULL");
    timestamps(knex, t);
    t.unique(["organization_id", "code"]);
    t.index(["organization_id", "status"]);
    t.index(["organization_id", "assignee_id"]);
    t.index("request_id");
  });

  await knex.schema.createTable("task_comments", (t) => {
    t.increments("id");
    t.integer("task_id").unsigned().notNullable().references("id").inTable("tasks").onDelete("CASCADE");
    userRef(t, "author_id");
    t.text("body").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(nowDefault(knex));
    t.index("task_id");
  });

  // Files attached to a request / task / field record / onboarding submission.
  // The owner row is checked by the service layer (polymorphic, so no FK on attachable_id).
  await knex.schema.createTable("attachments", (t) => {
    t.increments("id");
    tenant(t);
    t.string("attachable_type", 30).notNullable(); // request | task | field_record | organization
    t.integer("attachable_id").unsigned().notNullable();
    t.string("name").notNullable();
    t.integer("size").notNullable().defaultTo(0);
    t.string("mime", 150);
    t.string("storage_key").notNullable();
    userRef(t, "uploaded_by");
    t.timestamp("created_at").notNullable().defaultTo(nowDefault(knex));
    t.index(["attachable_type", "attachable_id"]);
  });

  await knex.schema.createTable("notifications", (t) => {
    t.increments("id");
    tenant(t);
    t.integer("user_id").unsigned().notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("title").notNullable();
    t.text("message");
    t.string("type", 20).notNullable().defaultTo("system"); // system task alert
    t.boolean("is_read").notNullable().defaultTo(false);
    t.string("link");
    t.timestamp("created_at").notNullable().defaultTo(nowDefault(knex));
    t.index(["user_id", "is_read", "created_at"]);
  });

  await knex.schema.createTable("folders", (t) => {
    t.increments("id");
    tenant(t);
    t.string("name").notNullable();
    timestamps(knex, t);
    t.unique(["organization_id", "name"]);
  });

  await knex.schema.createTable("files", (t) => {
    t.increments("id");
    tenant(t);
    t.integer("folder_id").unsigned().references("id").inTable("folders").onDelete("SET NULL");
    t.string("name").notNullable();
    t.integer("size").notNullable().defaultTo(0);
    t.string("mime", 150);
    t.string("storage_key").notNullable();
    userRef(t, "uploaded_by");
    t.timestamp("created_at").notNullable().defaultTo(nowDefault(knex));
    t.index(["organization_id", "folder_id"]);
  });

  await knex.schema.createTable("reports", (t) => {
    t.increments("id");
    tenant(t);
    t.string("name").notNullable();
    t.string("type");
    t.string("period");
    t.string("storage_key"); // NULL => rendered on demand
    t.integer("size");
    userRef(t, "created_by");
    t.timestamp("created_at").notNullable().defaultTo(nowDefault(knex));
    t.index(["organization_id", "type"]);
  });

  // Global catalog of product units; each org toggles them via org_units.
  await knex.schema.createTable("units", (t) => {
    t.increments("id");
    t.string("key", 50).notNullable().unique();
    t.string("title").notNullable();
    t.text("description");
    t.string("tier", 20).notNullable().defaultTo("optional"); // core | optional
    t.string("availability", 20).notNullable().defaultTo("available"); // available | in_development
    t.integer("roles_count").notNullable().defaultTo(0);
    t.integer("screens_count").notNullable().defaultTo(0);
    t.string("manager_roles");
    t.string("icon", 30);
    t.string("href");
    t.integer("sort_order").notNullable().defaultTo(0);
  });

  await knex.schema.createTable("org_units", (t) => {
    t.integer("organization_id").unsigned().notNullable().references("id").inTable("organizations").onDelete("CASCADE");
    t.integer("unit_id").unsigned().notNullable().references("id").inTable("units").onDelete("CASCADE");
    t.boolean("enabled").notNullable().defaultTo(false);
    t.boolean("setup_required").notNullable().defaultTo(false);
    t.primary(["organization_id", "unit_id"]);
  });
}

export async function down(knex) {
  for (const name of ["org_units", "units", "reports", "files", "folders", "notifications", "attachments", "task_comments", "tasks", "request_activities", "request_comments", "requests"]) {
    await knex.schema.dropTableIfExists(name);
  }
}
