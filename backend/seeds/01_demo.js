// `npm run seed` — demo data (idempotent). Skipped in production: it creates accounts with a published password.
import { loadEnv } from "../src/config/env.js";
import { createLocalStorage } from "../src/lib/storage.js";
import { seedDemo } from "../src/demo/seed.js";

export async function seed(knex) {
  const env = loadEnv();
  if (env.isProd) {
    console.log("seeds/01_demo.js: skipped in production");
    return;
  }
  const result = await seedDemo(knex, { storage: createLocalStorage(env.uploadDir), scryptLogN: env.SCRYPT_LOG_N });
  console.log(result.skipped ? "demo data already present" : `demo data created (organization #${result.organizationId})`);
}
