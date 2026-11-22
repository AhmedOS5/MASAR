// A project is mandatory: every request, task, folder, report and file lives inside one.
// Rows that predate this rule (no project) are deleted — the data is test data and there is no project to move them into.
// Then project_id (and files.folder_id) become NOT NULL, and their foreign keys CASCADE instead of SET NULL.
//
// Not transactional on purpose: SQLite rebuilds a table to change a column, and `PRAGMA foreign_keys = OFF` (needed so
// that dropping the old table does not cascade-delete the rows that reference it) is ignored inside a transaction.

export const config = { transaction: false };

const isPg = (knex) => knex.client.config.client === "pg";

/** Delete everything that has no project, together with the rows that hang off it. */
async function purgeOrphans(knex) {
  const orphanFolders = knex("folders").whereNull("project_id").select("id");
  const orphanFiles = () => knex("files").where((w) => w.whereNull("folder_id").orWhereIn("folder_id", orphanFolders));
  const orphanRequests = () => knex("requests").whereNull("project_id").select("id");
  const orphanTasks = () => knex("tasks").whereNull("project_id").select("id");

  await knex("attachments").where("attachable_type", "request").whereIn("attachable_id", orphanRequests()).del();
  await knex("attachments").where("attachable_type", "task").whereIn("attachable_id", orphanTasks()).del();
  await orphanFiles().del();
  await knex("reports").whereNull("project_id").del();
  await knex("folders").whereNull("project_id").del();
  await knex("tasks").whereNull("project_id").del();
  // a task of a surviving project may point at a request that is about to go: unlink it
  await knex("tasks").whereIn("request_id", orphanRequests()).update({ request_id: null });
  await knex("requests").whereNull("project_id").del();
}

async function setRequired(knex, table, column, ref, required) {
  if (isPg(knex)) {
    await knex.raw(`alter table ?? drop constraint if exists ??`, [table, `${table}_${column}_foreign`]);
    await knex.raw(`alter table ?? alter column ?? ${required ? "set" : "drop"} not null`, [table, column]);
    await knex.raw(`alter table ?? add constraint ?? foreign key (??) references ?? (id) on delete ${required ? "cascade" : "set null"}`, [
      table, `${table}_${column}_foreign`, column, ref,
    ]);
    return;
  }
  await knex.schema.alterTable(table, (t) => t.dropForeign([column])); // otherwise knex keeps the old constraint beside the new one
  await knex.schema.alterTable(table, (t) => {
    const col = t.integer(column).unsigned();
    if (required) col.notNullable();
    else col.nullable();
    col.references("id").inTable(ref).onDelete(required ? "CASCADE" : "SET NULL").alter();
  });
}

export async function up(knex) {
  await purgeOrphans(knex); // with foreign keys still ON, so comments, activities … of the deleted rows cascade away
  if (!isPg(knex)) await knex.raw("PRAGMA foreign_keys = OFF");
  try {
    await setRequired(knex, "requests", "project_id", "projects", true);
    await setRequired(knex, "tasks", "project_id", "projects", true);
    await setRequired(knex, "folders", "project_id", "projects", true);
    await setRequired(knex, "reports", "project_id", "projects", true);
    await setRequired(knex, "files", "folder_id", "folders", true);
  } finally {
    if (!isPg(knex)) await knex.raw("PRAGMA foreign_keys = ON");
  }
}

export async function down(knex) {
  if (!isPg(knex)) await knex.raw("PRAGMA foreign_keys = OFF");
  try {
    await setRequired(knex, "files", "folder_id", "folders", false);
    await setRequired(knex, "reports", "project_id", "projects", false);
    await setRequired(knex, "folders", "project_id", "projects", false);
    await setRequired(knex, "tasks", "project_id", "projects", false);
    await setRequired(knex, "requests", "project_id", "projects", false);
  } finally {
    if (!isPg(knex)) await knex.raw("PRAGMA foreign_keys = ON");
  }
}
