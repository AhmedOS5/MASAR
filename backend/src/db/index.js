// Knex factory. SQLite (dev/test) and PostgreSQL (production) share the same migrations and queries,
// so repository code must stay portable: no raw dialect-specific SQL, no JSON columns.
import knex from "knex";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { BACKEND_ROOT } from "../config/env.js";

// `date` columns (due_date, received_at, activity_date) must stay plain "YYYY-MM-DD" strings,
// not JS Dates shifted by the server timezone. NUMERIC (money) comes back as a number.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const MIGRATIONS_DIR = path.join(BACKEND_ROOT, "migrations");
export const SEEDS_DIR = path.join(BACKEND_ROOT, "seeds");

const isPostgres = (url) => /^postgres(ql)?:\/\//.test(url ?? "");

/** Knex config for a resolved env (see config/env.js). `sqliteFile: ":memory:"` is used by tests. */
export function knexConfig(env, { sqliteFile } = {}) {
  const common = {
    migrations: { directory: MIGRATIONS_DIR, loadExtensions: [".js"] },
    seeds: { directory: SEEDS_DIR, loadExtensions: [".js"] },
  };

  if (isPostgres(env.DATABASE_URL)) {
    return {
      ...common,
      client: "pg",
      connection: env.DATABASE_URL,
      pool: { min: 0, max: 10 },
    };
  }

  const filename = sqliteFile ?? path.resolve(BACKEND_ROOT, env.SQLITE_PATH);
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  return {
    ...common,
    client: "better-sqlite3",
    connection: { filename },
    useNullAsDefault: true,
    // An in-memory database is per-connection, so it needs exactly one.
    pool: {
      min: 1,
      max: filename === ":memory:" ? 1 : 4,
      afterCreate(conn, done) {
        conn.pragma("foreign_keys = ON");
        conn.pragma("journal_mode = WAL");
        done(null, conn);
      },
    },
  };
}

export function createDb(env, opts) {
  return knex(knexConfig(env, opts));
}

export const dialect = (db) => (db.client.config.client === "pg" ? "pg" : "sqlite");
