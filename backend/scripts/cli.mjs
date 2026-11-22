// Operator CLI (no HTTP needed):
//   node scripts/cli.mjs create-platform-admin --email ops@masar.io --name "Ops"   (password: PLATFORM_ADMIN_PASSWORD env, else generated and printed once)
//   node scripts/cli.mjs orgs [--status pending_approval] [--search text]
//   node scripts/cli.mjs show <orgId>
//   node scripts/cli.mjs approve <orgId>
//   node scripts/cli.mjs reject <orgId> --reason "..."
//   node scripts/cli.mjs suspend <orgId> [--reason "..."]
import { parseArgs } from "node:util";
import { randomInt } from "node:crypto";
import { loadEnv } from "../src/config/env.js";
import { createDb } from "../src/db/index.js";
import { createMailer } from "../src/lib/mailer.js";
import { createOrganizationService } from "../src/modules/organizations/service.js";
import { ValidationError, HttpError } from "../src/lib/errors.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: "string" },
    name: { type: "string" },
    status: { type: "string" },
    search: { type: "string" },
    reason: { type: "string" },
  },
});
const [cmd, arg] = positionals;

const env = loadEnv();
const db = createDb(env);
const log = { info: (_o, msg) => console.log(msg), error: (o, msg) => console.error(msg, o?.err?.message ?? "") };
const orgs = createOrganizationService({ db, config: env, mailer: createMailer(env, log) });

function generatePassword() {
  const sets = ["abcdefghjkmnpqrstuvwxyz", "ABCDEFGHJKMNPQRSTUVWXYZ", "23456789", "!@#$%^&*-_"];
  const pick = (s) => s[randomInt(s.length)];
  const chars = [...sets.map(pick), ...Array.from({ length: 16 }, () => pick(sets.join("")))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const orgId = () => {
  const n = Number(arg);
  if (!Number.isInteger(n) || n <= 0) throw new Error("An organization id is required, e.g. `approve 12`.");
  return n;
};

try {
  switch (cmd) {
    case "create-platform-admin": {
      const generated = !process.env.PLATFORM_ADMIN_PASSWORD;
      const password = process.env.PLATFORM_ADMIN_PASSWORD || generatePassword();
      const u = await orgs.createPlatformAdmin({ email: values.email, name: values.name, password });
      console.log(`Platform admin #${u.id} created: ${u.email}`);
      if (generated) console.log(`Password (shown once): ${password}`);
      break;
    }
    case "orgs": {
      const { data, meta } = await orgs.list({ status: values.status, search: values.search, per_page: 100 });
      console.table(data.map((o) => ({ id: o.id, status: o.status, name: o.name, admin: o.admin?.email ?? "", submitted: o.submitted_at?.slice(0, 10) ?? "" })));
      console.log(`${meta.total} organization(s)`);
      break;
    }
    case "show":
      console.dir(await orgs.detail(orgId()), { depth: null });
      break;
    case "approve":
    case "reject":
    case "suspend": {
      if (cmd === "reject" && !values.reason) throw new Error("--reason is required to reject.");
      const o = await orgs.decide(orgId(), cmd, { reason: values.reason ?? null });
      console.log(`#${o.id} ${o.name}: ${o.status}`);
      break;
    }
    default:
      console.error("Commands: create-platform-admin | orgs | show <id> | approve <id> | reject <id> --reason | suspend <id>");
      process.exitCode = 2;
  }
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(Object.entries(err.errors).map(([f, m]) => `${f}: ${m.join(" ")}`).join("\n"));
  } else {
    console.error(err instanceof HttpError || (err instanceof Error && !process.env.DEBUG) ? err.message : err);
  }
  process.exitCode = 1;
} finally {
  await db.destroy();
}
