// Vitest global teardown for runs against PostgreSQL (TEST_DATABASE_URL): drops any throw-away `masar_test_*` database
// that a test left behind (tests that never close their app, an aborted run …), before and after the run.
import knex from "knex";

async function dropLeftovers() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const admin = knex({ client: "pg", connection: url, pool: { min: 0, max: 1 } });
  try {
    const rows = await admin.raw("select datname from pg_database where datname like 'masar\\_test\\_%'");
    for (const { datname } of rows.rows) await admin.raw(`drop database if exists "${datname}" with (force)`);
  } finally {
    await admin.destroy();
  }
}

export async function setup() {
  await dropLeftovers();
}
export async function teardown() {
  await dropLeftovers();
}
