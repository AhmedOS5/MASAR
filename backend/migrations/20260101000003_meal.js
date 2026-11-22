// MEAL module: complaints, indicators, MEAL reports + templates, field records.
import { timestamps, tenant, userRef, nowDefault } from "../src/db/schema-helpers.js";

export async function up(knex) {
  await knex.schema.createTable("complaints", (t) => {
    t.increments("id");
    tenant(t);
    t.string("code", 30).notNullable();
    t.string("type").notNullable();
    t.string("project");
    t.string("region");
    t.string("channel");
    t.string("priority", 20).notNullable().defaultTo("medium"); // low medium high sensitive
    t.string("status", 20).notNullable().defaultTo("new"); // new in_progress resolved closed
    userRef(t, "owner_id");
    t.string("reporter_name");
    t.text("description");
    t.date("received_at").notNullable();
    timestamps(knex, t);
    t.unique(["organization_id", "code"]);
    t.index(["organization_id", "status"]);
    t.index(["organization_id", "priority"]);
  });

  await knex.schema.createTable("indicators", (t) => {
    t.increments("id");
    tenant(t);
    t.string("code", 30).notNullable();
    t.string("name").notNullable();
    t.string("project");
    t.string("sector");
    t.decimal("target", 14, 2).notNullable().defaultTo(0);
    t.decimal("achieved", 14, 2).notNullable().defaultTo(0);
    t.string("status", 20).notNullable().defaultTo("needs_follow"); // on_track needs_follow delayed achieved
    userRef(t, "owner_id");
    timestamps(knex, t);
    t.unique(["organization_id", "code"]);
    t.index(["organization_id", "status"]);
  });

  await knex.schema.createTable("meal_reports", (t) => {
    t.increments("id");
    tenant(t);
    t.string("title").notNullable();
    t.string("type");
    t.string("project");
    t.string("period");
    t.string("status", 20).notNullable().defaultTo("draft"); // draft in_review needs_edit approved
    userRef(t, "owner_id");
    t.text("body");
    timestamps(knex, t);
    t.index(["organization_id", "status"]);
  });

  // organization_id NULL = built-in template visible to every org.
  await knex.schema.createTable("report_templates", (t) => {
    t.increments("id");
    t.integer("organization_id").unsigned().references("id").inTable("organizations").onDelete("CASCADE");
    t.string("name").notNullable();
    t.string("type");
    t.text("description");
  });

  await knex.schema.createTable("field_records", (t) => {
    t.increments("id");
    tenant(t);
    t.string("project");
    t.string("sector");
    t.string("activity_type");
    t.date("activity_date");
    t.string("title");
    t.text("description");
    t.string("region");
    t.string("location");
    t.integer("indicator_id").unsigned().references("id").inTable("indicators").onDelete("SET NULL");
    t.decimal("achieved_value", 14, 2);
    t.integer("total_beneficiaries");
    t.string("status", 20).notNullable().defaultTo("draft"); // draft | submitted
    userRef(t, "created_by");
    t.timestamp("created_at").notNullable().defaultTo(nowDefault(knex));
    t.index(["organization_id", "status"]);
    t.index("indicator_id");
  });
}

export async function down(knex) {
  for (const name of ["field_records", "report_templates", "meal_reports", "indicators", "complaints"]) {
    await knex.schema.dropTableIfExists(name);
  }
}
