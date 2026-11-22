// Tenancy + identity: organizations, roles, users, tokens, lookups, per-org counters.
import { timestamps, tenant, nowDefault } from "../src/db/schema-helpers.js";

export async function up(knex) {
  await knex.schema.createTable("organizations", (t) => {
    t.increments("id");
    t.string("name").notNullable();
    t.string("type", 20).notNullable().defaultTo("ngo"); // ngo | ingo | gov | company
    t.string("email").notNullable();
    t.string("phone", 50);
    t.string("region");
    // Drives users' `onboarding_status`: incomplete -> pending_approval -> approved (| rejected | suspended)
    t.string("status", 30).notNullable().defaultTo("incomplete");
    t.timestamp("approved_at");
    t.integer("approved_by").unsigned(); // users.id of the platform admin (no FK: avoids a cycle)
    t.text("rejection_reason");
    timestamps(knex, t);
    t.index("status");
  });

  // Onboarding questionnaire (POST /organization/o). Name/type/email/phone live on organizations.
  await knex.schema.createTable("organization_profiles", (t) => {
    t.increments("id");
    t.integer("organization_id").unsigned().notNullable().unique().references("id").inTable("organizations").onDelete("CASCADE");
    t.string("registration_number");
    t.string("country");
    t.string("address");
    t.string("contact_person_name");
    t.text("sectors"); // JSON-encoded string[] (kept as text so SQLite and PostgreSQL behave the same)
    t.string("organization_size", 50);
    t.integer("volunteers_count");
    t.integer("years_of_experience");
    t.text("notes");
    t.timestamp("submitted_at");
    timestamps(knex, t);
  });

  await knex.schema.createTable("roles", (t) => {
    t.increments("id");
    tenant(t);
    t.string("title").notNullable();
    t.boolean("is_system_admin").notNullable().defaultTo(false);
    timestamps(knex, t);
    t.unique(["organization_id", "title"]);
  });

  // Permission keys come from the code catalog (src/modules/auth/permissions.js), not a table.
  await knex.schema.createTable("role_permissions", (t) => {
    t.integer("role_id").unsigned().notNullable().references("id").inTable("roles").onDelete("CASCADE");
    t.string("permission_key", 100).notNullable();
    t.primary(["role_id", "permission_key"]);
  });

  // A user is also an "employee" (GET /employees). password_hash is NULL until the invite flow sets one.
  await knex.schema.createTable("users", (t) => {
    t.increments("id");
    t.integer("organization_id").unsigned().references("id").inTable("organizations").onDelete("CASCADE"); // NULL = platform admin
    t.integer("role_id").unsigned().references("id").inTable("roles").onDelete("SET NULL");
    t.string("name").notNullable();
    t.string("email").notNullable().unique(); // stored lowercase; login is by e-mail alone
    t.string("phone", 50);
    t.string("department");
    t.string("password_hash");
    t.string("status", 20).notNullable().defaultTo("active"); // active | inactive
    t.boolean("is_platform_admin").notNullable().defaultTo(false);
    t.timestamp("email_verified_at");
    t.timestamp("last_login_at");
    timestamps(knex, t);
    t.index(["organization_id", "status"]);
  });

  // Opaque bearer tokens. Only the SHA-256 of the token is stored.
  await knex.schema.createTable("auth_tokens", (t) => {
    t.increments("id");
    t.integer("user_id").unsigned().notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("token_hash", 64).notNullable().unique();
    t.timestamp("expires_at").notNullable();
    t.timestamp("last_used_at");
    t.timestamp("created_at").notNullable().defaultTo(nowDefault(knex));
    t.index("user_id");
  });

  // Select-box lookups for GET /options (departments, projects, regions, ...).
  await knex.schema.createTable("options", (t) => {
    t.increments("id");
    tenant(t);
    t.string("kind", 50).notNullable();
    t.string("value").notNullable();
    t.string("label");
    t.integer("sort_order").notNullable().defaultTo(0);
    t.unique(["organization_id", "kind", "value"]);
  });

  // Atomic per-org sequences for human-readable codes (REQ-001, TSK-001, FCRM-900, ...).
  await knex.schema.createTable("counters", (t) => {
    t.integer("organization_id").unsigned().notNullable().references("id").inTable("organizations").onDelete("CASCADE");
    t.string("key", 50).notNullable();
    t.integer("value").notNullable().defaultTo(0);
    t.primary(["organization_id", "key"]);
  });
}

export async function down(knex) {
  for (const name of ["counters", "options", "auth_tokens", "users", "role_permissions", "roles", "organization_profiles", "organizations"]) {
    await knex.schema.dropTableIfExists(name);
  }
}
