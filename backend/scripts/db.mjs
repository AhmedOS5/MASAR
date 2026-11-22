// Usage: node scripts/db.mjs <migrate|rollback|seed|reset|status>
//   migrate   run pending migrations        rollback  undo the last batch
//   seed      run seeds/ (idempotent)       reset     drop everything, migrate, seed (refuses in production)
import { loadEnv } from "../src/config/env.js";
import fs from "node:fs";
import { createDb } from "../src/db/index.js";

const cmd = process.argv[2];
const env = loadEnv();
const db = createDb(env);

try {
  switch (cmd) {
    case "migrate": {
      const [batch, files] = await db.migrate.latest();
      console.log(files.length ? `Batch ${batch}: ${files.join(", ")}` : "Already up to date.");
      break;
    }
    case "rollback": {
      const [batch, files] = await db.migrate.rollback();
      console.log(files.length ? `Rolled back batch ${batch}: ${files.join(", ")}` : "Nothing to roll back.");
      break;
    }
    case "seed": {
      const [files] = await db.seed.run();
      console.log(`Seeded: ${files.length ? files.map((f) => f.split(/[\\/]/).pop()).join(", ") : "(no seed files)"}`);
      break;
    }
    case "status": {
      const [done, pending] = await db.migrate.list();
      console.log(`${done.length} applied, ${pending.length} pending`);
      break;
    }
    case "reset": {
      if (env.isProd) throw new Error("db:reset is disabled in production.");
      fs.rmSync(env.uploadDir, { recursive: true, force: true });
      await db.migrate.rollback(undefined, true);
      await db.migrate.latest();
      const [files] = await db.seed.run();
      console.log(`Database reset. Seeded ${files.length} file(s).`);
      break;
    }
    default:
      console.error("Usage: node scripts/db.mjs <migrate|rollback|seed|reset|status>");
      process.exitCode = 2;
  }
} finally {
  await db.destroy();
}
