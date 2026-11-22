import { loadEnv } from "./config/env.js";
import { createDb } from "./db/index.js";
import { buildApp } from "./app.js";

const env = loadEnv();
const db = createDb(env);

// Refuse to serve on an un-migrated database: fail fast with a clear instruction.
const [, pending] = await db.migrate.list();
if (pending.length) {
  console.error(`${pending.length} pending migration(s). Run: npm run migrate`);
  await db.destroy();
  process.exit(1);
}

const app = await buildApp({ env, db });

// Say how verification codes will be delivered, and fail loudly (but do not crash) if SMTP is unreachable/misconfigured.
if (env.mailTransport === "smtp") {
  const ok = await app.mailer.verify();
  app.log[ok ? "info" : "error"](`mail: SMTP ${env.SMTP_HOST}:${env.SMTP_PORT} (secure=${env.SMTP_SECURE}) ${ok ? "connection OK" : "connection FAILED — verification e-mails will not be delivered"}`);
} else {
  app.log.info(`mail: transport=${env.mailTransport}${env.mailTransport === "console" ? " (nothing is sent; verification codes are printed to this console)" : ""}`);
}

// Per-IP rate limits key on the address of the TCP peer unless TRUST_PROXY says whose X-Forwarded-For to believe.
if (env.isProd) {
  if (!env.TRUST_PROXY) {
    app.log.warn("TRUST_PROXY is not set: behind the Next.js server every request comes from ONE address, so the per-IP rate limits are shared by all users. Set TRUST_PROXY to the address/range of that server (see backend/README.md).");
  } else if (env.TRUST_PROXY === true) {
    app.log.warn("TRUST_PROXY=true believes X-Forwarded-For from anyone: safe only if this API is reachable exclusively through the Next.js server. Prefer an address list, e.g. TRUST_PROXY=10.0.0.0/8.");
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  });
}

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
