// Scope decision (graduation project): volunteer management is not part of MASAR, so the organization profile no longer
// records a volunteers count. The onboarding API still tolerates the field from older clients (it is ignored).
export async function up(knex) {
  if (await knex.schema.hasColumn("organization_profiles", "volunteers_count")) {
    await knex.schema.alterTable("organization_profiles", (t) => t.dropColumn("volunteers_count"));
  }
}

export async function down(knex) {
  if (!(await knex.schema.hasColumn("organization_profiles", "volunteers_count"))) {
    await knex.schema.alterTable("organization_profiles", (t) => t.integer("volunteers_count"));
  }
}
