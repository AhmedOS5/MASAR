import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnv } from "../src/config/env.js";
import { createDb } from "../src/db/index.js";
import { buildApp } from "../src/app.js";

export const testEnv = (overrides = {}) =>
  loadEnv({ NODE_ENV: "test", SQLITE_PATH: ":memory:", SCRYPT_LOG_N: "10", RATE_LIMIT_SCALE: "1000", LOG_LEVEL: "silent", EMAIL_OTP_RESEND_COOLDOWN_SECONDS: "0", ...overrides });

/**
 * Fresh migrated database: in-memory SQLite, or — with TEST_DATABASE_URL=postgres://user:pass@host:5432/postgres — a
 * throw-away PostgreSQL database that is created here and dropped when the db is destroyed (so the whole suite can run
 * against PostgreSQL: `TEST_DATABASE_URL=… npm test`).
 */
export async function testDb(overrides) {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    const db = createDb(testEnv(overrides), { sqliteFile: ":memory:" });
    await db.migrate.latest();
    return db;
  }
  const { default: knex } = await import("knex");
  const name = `masar_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = knex({ client: "pg", connection: adminUrl, pool: { min: 0, max: 1 } });
  await admin.raw(`create database ${name}`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const real = createDb(testEnv({ ...overrides, DATABASE_URL: url.toString() }));
  await real.migrate.latest();
  // knex's `destroy` cannot be reassigned, so hand out a proxy whose destroy also drops the throw-away database
  const destroyAndDrop = async () => {
    await real.destroy();
    await admin.raw(`drop database if exists ${name} with (force)`);
    await admin.destroy();
  };
  return new Proxy(real, {
    get(target, prop) {
      if (prop === "destroy") return destroyAndDrop;
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * App on a throw-away database. `extend(app)` can register extra routes before the app is ready.
 * Always `await app.close()` (it also destroys the db and removes the upload directory).
 */
export async function testApp({ extend, env: overrides, patch } = {}) {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "masar-up-"));
  const env = { ...testEnv({ UPLOAD_DIR: uploadDir, ...overrides }), ...patch };
  const db = await testDb(overrides);
  const app = await buildApp({ env, db });
  app.addHook("onClose", async () => fs.rmSync(env.uploadDir, { recursive: true, force: true }));
  if (extend) await extend(app);
  await app.ready();
  return app;
}

// ------------------------------------------------------------------ auth helpers
export const PASSWORD = "Passw0rd!";

export const registrationBody = (over = {}) => ({
  organization_name: "منظمة النور",
  organization_email: "info@alnoor.org",
  admin_email: "admin@org.org",
  organization_region: "غزة",
  organization_phone: "+970591112222",
  admin_password: PASSWORD,
  admin_password_confirmation: PASSWORD,
  organization_type: "ngo",
  agreed_to_terms: true,
  ...over,
});

export const post = (app, url, payload, headers = {}) => app.inject({ method: "POST", url, payload, headers });
export const bearer = (token) => ({ authorization: `Bearer ${token}` });

export const register = (app, over) => post(app, "/auth/register", registrationBody(over));

/** The 6-digit code in the latest e-mail sent to `email` (the only way a code leaves the server). */
export function otpFor(app, email) {
  const mail = [...app.mailer.outbox].reverse().find((m) => m.to === String(email).trim().toLowerCase());
  return mail ? /(?<!\d)\d{6}(?!\d)/.exec(mail.text)?.[0] : undefined;
}
export const verifyEmailCode = (app, email, code) => post(app, "/auth/verify-email", { email, code });

/** Register + verify the e-mail with the code that was e-mailed; returns the new user's ids. */
export async function registerVerified(app, over) {
  const body = registrationBody(over);
  const res = await post(app, "/auth/register", body);
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  const ok = await verifyEmailCode(app, body.admin_email, otpFor(app, body.admin_email));
  if (ok.statusCode !== 200) throw new Error(`verify failed: ${ok.body}`);
  const user = await app.db("users").where({ email: body.admin_email.trim().toLowerCase() }).first();
  return { body, userId: user.id, organizationId: user.organization_id, email: user.email };
}

export const login = (app, email = "admin@org.org", password = PASSWORD) =>
  post(app, "/login", { admin_email: email, admin_password: password });

/** registerVerified + approve the organization + login => { token, headers, organizationId, ... } */
export async function signedInAdmin(app, over = {}) {
  const reg = await registerVerified(app, over);
  await app.db("organizations").where({ id: reg.organizationId }).update({ status: "approved" });
  const res = await login(app, reg.email);
  return { ...reg, token: res.json().token, headers: bearer(res.json().token) };
}

/** registerVerified + login while the organization is still incomplete (the onboarding state). */
export async function newcomer(app, over = {}) {
  const reg = await registerVerified(app, over);
  const res = await login(app, reg.email);
  return { ...reg, token: res.json().token, headers: bearer(res.json().token) };
}

/** A regular member of `admin`'s organization holding exactly `permissions` (role is created on the fly). */
export async function member(app, admin, { email = "member@org.org", name = "Member", permissions = [] } = {}) {
  const { hashPassword } = await import("../src/lib/password.js");
  const [{ id: roleId }] = await app.db("roles").insert({ organization_id: admin.organizationId, title: `role-${email}` }, ["id"]);
  if (permissions.length) await app.db("role_permissions").insert(permissions.map((permission_key) => ({ role_id: roleId, permission_key })));
  const [{ id: userId }] = await app.db("users").insert(
    { organization_id: admin.organizationId, role_id: roleId, name, email, password_hash: await hashPassword(PASSWORD, { logN: 10 }), email_verified_at: new Date().toISOString() },
    ["id"],
  );
  const res = await login(app, email);
  return { userId, organizationId: admin.organizationId, headers: bearer(res.json().token) };
}

/** A logged-in platform operator. */
export async function platformAdmin(app, email = "ops@masar.io") {
  await app.orgService.createPlatformAdmin({ email, name: "Ops", password: PASSWORD });
  const res = await login(app, email);
  return { headers: bearer(res.json().token) };
}

// ------------------------------------------------------------------ multipart helper
const CRLF = "\r\n";

/** parts: { name, value } | { name, filename, type, content: Buffer|string } -> { payload, headers } for app.inject */
export function multipart(parts) {
  const boundary = "----masar" + Math.random().toString(16).slice(2);
  const chunks = [];
  for (const p of parts) {
    chunks.push(Buffer.from("--" + boundary + CRLF));
    if (p.filename !== undefined) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"` + CRLF + `Content-Type: ${p.type ?? "application/octet-stream"}` + CRLF + CRLF,
        ),
      );
      chunks.push(Buffer.isBuffer(p.content) ? p.content : Buffer.from(p.content ?? ""));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.name}"` + CRLF + CRLF + String(p.value)));
    }
    chunks.push(Buffer.from(CRLF));
  }
  chunks.push(Buffer.from("--" + boundary + "--" + CRLF));
  return { payload: Buffer.concat(chunks), headers: { "content-type": "multipart/form-data; boundary=" + boundary } };
}

export const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(200, 0x20)]);
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);
export const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 2)]);

export const onboardingBody = (over = {}) => ({
  organization_name: "منظمة النور",
  organization_type: "NGO",
  registration_number: "REG-123",
  country: "PS",
  phone: "+970 59 111 2222",
  email: "official@alnoor.org",
  address: "غزة - الرمال",
  contact_person_name: "ليلى المحمود",
  sectors: ["water", "health"],
  organization_size: "small",
  years_of_experience: 5,
  notes: "ملاحظات",
  ...over,
});

/** All files currently on disk under the app's upload dir. */
export function filesOnDisk(app) {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(app.config.uploadDir);
  return out;
}

// ------------------------------------------------------------------ projects
/**
 * A project in `admin`'s organization with the given team (`[{ user, role }]`, role = "supervisor" | "member").
 * The system admin reaches every project without being listed. Returns the project id.
 */
export async function makeProject(app, admin, team = [], { name } = {}) {
  const { nextCode } = await import("../src/lib/sequence.js");
  const db = app.db;
  const code = await nextCode(db, admin.organizationId, "project", "PRJ");
  const [{ id }] = await db("projects").insert({ organization_id: admin.organizationId, code, name: name ?? `مشروع ${code}`, created_by: admin.userId }, ["id"]);
  if (team.length) await db("project_members").insert(team.map(({ user, role = "member" }) => ({ project_id: id, user_id: user.userId, project_role: role })));
  return id;
}

/** The project of `admin`'s organization called `name`, created on first use (the admin works in every project; list `team` for others). */
export async function projectNamed(app, admin, name = "مشروع ألف", team = []) {
  const found = await app.db("projects").where({ organization_id: admin.organizationId, name }).first("id");
  return found ? found.id : makeProject(app, admin, team, { name });
}
