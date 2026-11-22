// 1) tasks.completed_at — when a task was finished (drives the "monthly progress" report figure).
// 2) reports.mime / reports.file_name — what the stored document actually is (decided at upload).
// 3) default document folders for organizations that already exist (new ones get them at registration).
const DEFAULT_FOLDERS = ["الوثائق الرسمية", "التقارير الميدانية", "الملفات المالية"];

export async function up(knex) {
  await knex.schema.alterTable("tasks", (t) => {
    t.timestamp("completed_at");
  });
  await knex.schema.alterTable("reports", (t) => {
    t.string("mime", 150);
    t.string("file_name");
  });
  // Best available approximation for tasks finished before this column existed.
  await knex("tasks").where({ status: "done" }).update({ completed_at: knex.ref("updated_at") });

  const orgIds = await knex("organizations").pluck("id");
  const rows = orgIds.flatMap((organization_id) => DEFAULT_FOLDERS.map((name) => ({ organization_id, name })));
  if (rows.length) await knex("folders").insert(rows).onConflict(["organization_id", "name"]).ignore();
}

export async function down(knex) {
  await knex.schema.alterTable("reports", (t) => {
    t.dropColumn("mime");
    t.dropColumn("file_name");
  });
  await knex.schema.alterTable("tasks", (t) => {
    t.dropColumn("completed_at");
  });
}
