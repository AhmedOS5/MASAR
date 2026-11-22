// Job title / category on employees, where their role came from (auto-assigned from the title, or set by hand), and a
// small append-only audit log (who changed what) — first used for role assignment and overrides.
import { nowDefault, tenant, userRef } from "../src/db/schema-helpers.js";

export async function up(knex) {
  await knex.schema.alterTable("users", (t) => {
    t.string("job_title", 100);
    t.string("job_category", 30); // a key of modules/people/job-roles.js
    t.string("role_source", 10); // auto | manual | NULL (no role, or a role from before this feature)
  });

  await knex.schema.createTable("audit_logs", (t) => {
    t.increments("id");
    tenant(t);
    userRef(t, "actor_id");
    t.string("action", 60).notNullable(); // e.g. employee.role_changed
    t.string("entity_type", 30).notNullable(); // e.g. user
    t.integer("entity_id").unsigned().notNullable(); // no FK: the entry outlives a deleted employee
    t.text("meta"); // JSON; never secrets
    t.timestamp("created_at").notNullable().defaultTo(nowDefault(knex));
    t.index(["organization_id", "entity_type", "entity_id"]);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("audit_logs");
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("job_title");
    t.dropColumn("job_category");
    t.dropColumn("role_source");
  });
}
