// Small helpers shared by the migrations so every table looks the same.

/**
 * DEFAULT for timestamp columns. SQLite's CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" while the app writes ISO-8601
 * ("…T…Z"); mixing the two breaks range comparisons on the boundary day, so SQLite gets an ISO default instead.
 */
export const nowDefault = (knex) =>
  knex.client.config.client === "pg" ? knex.fn.now() : knex.raw("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))");

/** created_at / updated_at (UTC). `updated_at` is maintained by the repositories. */
export function timestamps(knex, t) {
  t.timestamp("created_at").notNullable().defaultTo(nowDefault(knex));
  t.timestamp("updated_at").notNullable().defaultTo(nowDefault(knex));
}

/** Tenant column: every business table belongs to exactly one organization. */
export function tenant(t) {
  t.integer("organization_id")
    .unsigned()
    .notNullable()
    .references("id")
    .inTable("organizations")
    .onDelete("CASCADE");
}

/** Nullable user reference that survives the user being removed (e.g. DELETE /employees/{id}). */
export function userRef(t, column) {
  t.integer(column).unsigned().references("id").inTable("users").onDelete("SET NULL");
}
