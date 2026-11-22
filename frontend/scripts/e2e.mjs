// End-to-end verification:  node scripts/e2e.mjs [--http-only]
//   1. starts scripts/mock-backend.mjs (Laravel stand-in)  2. starts the PRODUCTION build (next start)
//   3. runs HTTP-level checks against the real running app (cookies, redirects, proxy, payloads)
//   4. runs the Playwright browser suite (e2e/*.spec.mjs) unless --http-only
// Requires a prior `next build`.  --real (or E2E_BACKEND=real) runs against ../backend instead of the mock.
import { spawn, spawnSync } from "node:child_process";

// `npm run e2e:real` (= node scripts/e2e.mjs --real) runs the suite against ../backend instead of the mock.
if (process.argv.includes("--real")) process.env.E2E_BACKEND = "real";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, ".."); // the frontend/ folder
const BACKEND_DIR = path.resolve(ROOT, "..", "backend"); // sibling folder
const API_PORT = process.env.MOCK_PORT || "4010";
const APP_PORT = process.env.E2E_APP_PORT || "3100";
const API = `http://localhost:${API_PORT}`;
const APP = `http://localhost:${APP_PORT}`;
const httpOnly = process.argv.includes("--http-only");

const DIST = ".next-e2e";
if (!fs.existsSync(path.join(ROOT, DIST, "BUILD_ID"))) {
  console.error(`No production build found in ${DIST}. Run \`npm run build:e2e\` first.`);
  process.exit(2);
}

// A stale server on one of our ports would silently answer instead of the one we start (and get polluted by the
// test data), so refuse to run when a port is taken. Override with MOCK_PORT / E2E_APP_PORT.
import net from "node:net";
for (const port of [API_PORT, APP_PORT]) {
  const busy = await new Promise((resolve) => {
    const probe = net.createServer().once("error", () => resolve(true)).once("listening", () => probe.close(() => resolve(false)));
    probe.listen(Number(port), "0.0.0.0");
  });
  if (busy) {
    console.error(`Port ${port} is already in use. Stop the process using it or set MOCK_PORT / E2E_APP_PORT to free ports.`);
    process.exit(2);
  }
}

const children = [];
const start = (cmd, args, env = {}) => {
  const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  p.stdout.on("data", () => {});
  p.stderr.on("data", (d) => process.env.E2E_VERBOSE && process.stderr.write(d));
  children.push(p);
  return p;
};
const stopAll = () => children.forEach((c) => { try { c.kill(); } catch { /* ignore */ } });
process.on("exit", stopAll);

async function waitFor(url, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status < 500) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timeout waiting for ${url}`);
}

// E2E_BACKEND=real runs the suite against ../backend (SQLite file, demo fixture, test controls) instead of the mock.
const REAL = process.env.E2E_BACKEND === "real";
const rid = (n) => (REAL ? String(n) : `R-${n}`); // request ids: numeric in the real API, "R-n" in the mock
if (REAL) {
  const dataDir = path.join(ROOT, ".e2e-data");
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const backendEnv = {
    ...process.env,
    NODE_ENV: "test", HOST: "127.0.0.1", PORT: API_PORT, FRONTEND_ORIGIN: APP,
    EMAIL_OTP_RESEND_COOLDOWN_SECONDS: "0", // the e2e resends codes back-to-back
    SQLITE_PATH: path.join(dataDir, "e2e.sqlite"), UPLOAD_DIR: path.join(dataDir, "uploads"),
    ENABLE_TEST_CONTROLS: "true", SCRYPT_LOG_N: "10", RATE_LIMIT_SCALE: "1000",
    TRUST_PROXY: "loopback", // the Next.js server is the only peer, on this machine: believe the address it forwards
  };
  const mig = spawnSync(process.execPath, ["scripts/db.mjs", "migrate"], { cwd: BACKEND_DIR, env: backendEnv, encoding: "utf8" });
  if (mig.status !== 0) {
    console.error(mig.stdout, mig.stderr);
    process.exit(2);
  }
  const p = spawn(process.execPath, ["src/server.js"], { cwd: BACKEND_DIR, env: backendEnv, stdio: ["ignore", "pipe", "pipe"] });
  p.stdout.on("data", () => {});
  p.stderr.on("data", (d) => process.env.E2E_VERBOSE && process.stderr.write(d));
  children.push(p);
} else {
  start("node", ["scripts/mock-backend.mjs"], { MOCK_PORT: API_PORT, MOCK_ORIGIN: API });
}
start("node", ["node_modules/next/dist/bin/next", "start", "-p", APP_PORT], {
  API_URL: API,
  TRUSTED_PROXY_HOPS: "1", // the test client plays the single reverse proxy in front of the app (it appends X-Forwarded-For)
  NEXT_DIST_DIR: DIST,
  NEXT_TELEMETRY_DISABLED: "1",
});
await waitFor(`${API}/__control/state`);
await waitFor(`${APP}/login`);

// ------------------------------------------------------------ tiny harness
let passed = 0;
const failures = [];
const results = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
    results.push(`  ✓ ${name}`);
  } catch (e) {
    failures.push(`${name}\n      ${e.message}`);
    results.push(`  ✗ ${name}\n      ${e.message}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "assertion failed"); };
const eq = (a, b, msg = "") => assert(JSON.stringify(a) === JSON.stringify(b), `${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);

class Client {
  constructor() { this.jar = {}; }
  async req(url, { method = "GET", body, headers = {}, redirect = "manual" } = {}) {
    const cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; ");
    const isJson = body !== undefined && !(body instanceof FormData);
    const res = await fetch(APP + url, {
      method, redirect,
      headers: { ...(isJson ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : isJson ? JSON.stringify(body) : body,
    });
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const c of raw) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (v === "" || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) delete this.jar[k];
      else this.jar[k] = v;
    }
    res.setCookies = raw;
    return res;
  }
  async json(url, opts) { const r = await this.req(url, opts); return { status: r.status, data: await r.json().catch(() => null), res: r }; }
  async login(email, password = "Passw0rd!") { return this.json("/api/auth/login", { method: "POST", body: { email, password, remember: true } }); }
}
const mock = {
  reset: () => fetch(`${API}/__control/reset`, { method: "POST" }),
  log: async () => (await fetch(`${API}/__control/log`)).json(),
  fail: (spec) => fetch(`${API}/__control/fail`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(spec) }),
  state: async () => (await fetch(`${API}/__control/state`)).json(),
};
const loc = (res) => res.headers.get("location") && new URL(res.headers.get("location"), APP);

// ------------------------------------------------------------- A. HTTP checks
await mock.reset();
const PROTECTED = [
  "/dashboard", "/dashboard/requests", `/dashboard/requests/${rid(1)}`, "/dashboard/tasks", "/dashboard/tasks/1", "/dashboard/employees",
  "/dashboard/roles", "/dashboard/files", "/dashboard/reports", "/dashboard/notifications", "/dashboard/units",
  "/dashboard/meal", "/dashboard/meal/complaints", "/dashboard/meal/field-data", "/dashboard/meal/indicators", "/dashboard/meal/reports",
  "/onboarding", "/onboarding/waiting-approval", "/operator",
];
const PUBLIC = ["/", "/login", "/register", "/verify-email?email=a%40b.co", "/set-password?email=a%40b.co", "/forgot-password", "/reset-password?email=a%40b.co", "/activation-success", "/terms", "/privacy"];

results.push("A. Route protection (production build, real proxy.js)");
const anon = new Client();
for (const p of PROTECTED) {
  await check(`unauthenticated ${p} -> 307 /login?next=`, async () => {
    const r = await anon.req(p);
    eq(r.status, 307, p);
    eq(loc(r).pathname, "/login");
    eq(loc(r).searchParams.get("next"), p);
  });
}
for (const p of PUBLIC) {
  await check(`public ${p} -> 200`, async () => eq((await anon.req(p)).status, 200));
}
await check("/under-review (removed duplicate) permanently redirects", async () => {
  const r = await anon.req("/under-review");
  assert([307, 308].includes(r.status), `status ${r.status}`);
  eq(loc(r).pathname, "/onboarding/waiting-approval");
});
await check("a forged onboarding_status cookie without a token is useless", async () => {
  const c = new Client();
  c.jar.onboarding_status = "approved";
  eq(loc(await c.req("/dashboard")).pathname, "/login");
});
await check("a forged auth_token cookie reaches the page shell but every API call is rejected (401) and the cookie is cleared", async () => {
  const c = new Client();
  c.jar.auth_token = "forged";
  c.jar.onboarding_status = "approved";
  const r = await c.json("/api/requests");
  eq(r.status, 401);
  assert(!c.jar.auth_token, "cookie should be cleared after the backend rejected it");
});

results.push("B. Registration & e-mail verification (payloads reach the backend intact)");
const REG = {
  organization_name: "مؤسسة الاختبار", organization_email: "info@test-org.org", admin_email: "owner@test-org.org",
  organization_region: "gaza", organization_phone: "+970 59 123 4567", admin_password: "Str0ng!Pass", admin_password_confirmation: "Str0ng!Pass",
  organization_type: "ngo", agreed_to_terms: true,
};
// The 6-digit verification code only ever travels by e-mail; the test reads it from the backend's outbox (control plane).
const mailTo = async (email) => ((await (await fetch(`${API}/__control/mail`)).json()).mail ?? []).filter((m) => m.to === email);
const otpFor = async (email) => /(?<!\d)\d{6}(?!\d)/.exec((await mailTo(email)).at(-1)?.text ?? "")?.[0];
const wrongOf = (code) => (code === "000000" ? "000001" : "000000");
await check("POST /api/auth/register forwards the exact payload (no auth header) and never returns the code", async () => {
  const r = await anon.json("/api/auth/register", { method: "POST", body: REG });
  eq(r.status, 201);
  assert(r.data.verification_url === undefined, "no verification URL any more");
  const code = await otpFor(REG.admin_email);
  assert(/^\d{6}$/.test(code), "a 6-digit code was e-mailed");
  assert(!JSON.stringify(r.data).includes(code), "the code must not be in the response");
  const log = await mock.log();
  const entry = log.log.find((l) => l.path === "/auth/register");
  eq(entry.body, REG);
  eq(entry.authorization, null);
});
await check("the original /api/register-organization path still works (alias)", async () => {
  const r = await anon.json("/api/register-organization", { method: "POST", body: { ...REG, admin_email: "alias@test-org.org" } });
  eq(r.status, 201);
});
await check("registration validation errors (422) pass through with field errors", async () => {
  const r = await anon.json("/api/auth/register", { method: "POST", body: { ...REG, admin_email: "owner@test-org.org" } });
  eq(r.status, 422);
  assert(JSON.stringify(r.data.errors.admin_email).includes("هذا البريد مستخدم مسبقاً"), "duplicate e-mail message");
  const bad = await anon.json("/api/auth/register", { method: "POST", body: { ...REG, admin_email: "x@y.org", agreed_to_terms: false, admin_password_confirmation: "nope" } });
  eq(bad.status, 422);
  assert(bad.data.errors.agreed_to_terms && bad.data.errors.admin_password, "missing field errors");
});
await check("login is refused until the e-mail is verified (403)", async () => {
  const r = await new Client().login("owner@test-org.org", "Str0ng!Pass");
  eq(r.status, 403);
});
await check("verify-email: malformed codes are 422 on `code` and do not verify", async () => {
  for (const code of ["", "12345", "1234567", "12a456"]) {
    const r = await anon.json("/api/auth/verify-email", { method: "POST", body: { email: REG.admin_email, code } });
    eq(r.status, 422, `code=${JSON.stringify(code)}`);
    assert(r.data.errors?.code?.length, "field error on code");
  }
  eq((await new Client().login(REG.admin_email, REG.admin_password)).status, 403);
});
await check("verify-email: a wrong code is 422 and the user stays unverified", async () => {
  const good = await otpFor(REG.admin_email);
  const r = await anon.json("/api/auth/verify-email", { method: "POST", body: { email: REG.admin_email, code: wrongOf(good) } });
  eq(r.status, 422);
  assert(r.data.errors?.code?.length, "field error on code");
  eq((await new Client().login(REG.admin_email, REG.admin_password)).status, 403);
});
await check("resend-verification e-mails a fresh code (the old one stops working on the real backend)", async () => {
  const before = (await mailTo(REG.admin_email)).length;
  const old = await otpFor(REG.admin_email);
  const r = await anon.json("/api/auth/resend-verification", { method: "POST", body: { email: REG.admin_email } });
  eq(r.status, 200);
  eq((await mailTo(REG.admin_email)).length, before + 1);
  const fresh = await otpFor(REG.admin_email);
  assert(/^\d{6}$/.test(fresh), "new 6-digit code");
  if (REAL && fresh !== old) {
    eq((await anon.json("/api/auth/verify-email", { method: "POST", body: { email: REG.admin_email, code: old } })).status, 422, "old code is dead");
  }
  // unknown and verified addresses never reveal anything: unknown -> 200 without mail, verified -> 400
  eq((await anon.json("/api/auth/resend-verification", { method: "POST", body: { email: "ghost@nowhere.org" } })).status, 200);
  eq((await mailTo("ghost@nowhere.org")).length, 0);
  eq((await anon.json("/api/auth/resend-verification", { method: "POST", body: { email: "admin@org.org" } })).status, 400);
});
await check("verify-email: 5 wrong attempts lock the code (429, even for the right code) until a new one is requested", async () => {
  const lock = { ...REG, admin_email: "lock@test-org.org" };
  eq((await anon.json("/api/auth/register", { method: "POST", body: lock })).status, 201);
  const good = await otpFor(lock.admin_email);
  for (let i = 1; i <= 5; i++) {
    eq((await anon.json("/api/auth/verify-email", { method: "POST", body: { email: lock.admin_email, code: wrongOf(good) } })).status, 422, `attempt ${i}`);
  }
  const locked = await anon.json("/api/auth/verify-email", { method: "POST", body: { email: lock.admin_email, code: good } });
  eq(locked.status, 429);
  assert(locked.data.message.includes("رمزاً جديداً"), "tells the user to request a new code");
  eq((await anon.json("/api/auth/resend-verification", { method: "POST", body: { email: lock.admin_email } })).status, 200);
  eq((await anon.json("/api/auth/verify-email", { method: "POST", body: { email: lock.admin_email, code: await otpFor(lock.admin_email) } })).status, 200);
});
await check("verify-email: unknown e-mails behave like wrong codes (5 × 422 then 429) — no account enumeration", async () => {
  const seq = [];
  for (let i = 0; i < 6; i++) seq.push((await anon.json("/api/auth/verify-email", { method: "POST", body: { email: "nobody@nowhere.org", code: "123456" } })).status);
  eq(seq, [422, 422, 422, 422, 422, 429]);
});
await check("verify-email: the right code verifies the e-mail; the code is single-use; login then works", async () => {
  const code = await otpFor(REG.admin_email);
  const ok = await anon.json("/api/auth/verify-email", { method: "POST", body: { email: REG.admin_email, code } });
  eq(ok.status, 200);
  eq(ok.data.verified, true);
  eq((await anon.json("/api/auth/verify-email", { method: "POST", body: { email: REG.admin_email, code } })).status, 422, "single use");
  eq((await new Client().login(REG.admin_email, REG.admin_password)).status, 200);
});
await check("the link-based endpoints are gone (404)", async () => {
  eq((await anon.json("/api/auth/verify-link?link=x")).status, 404);
  eq((await anon.json("/api/email/verification-status?email=a%40b.co")).status, 404);
  eq((await anon.json("/api/email/resend-verification", { method: "POST", body: { email: "a@b.co" } })).status, 404);
});

results.push("C. Authentication (HttpOnly cookie, token never exposed to JS)");
const admin = new Client();
await check("wrong password -> 401, no cookies set", async () => {
  const c = new Client();
  const r = await c.login("admin@org.org", "wrong");
  eq(r.status, 401);
  eq(r.res.setCookies.length, 0);
});
await check("login OK -> HttpOnly cookies, token absent from the JSON body", async () => {
  const r = await admin.login("admin@org.org");
  eq(r.status, 200);
  eq(r.data.redirect, "/dashboard");
  const cookies = r.res.setCookies.join("\n");
  const token = /auth_token=([^;]+)/.exec(cookies)?.[1];
  assert(token && token.length > 6, "auth_token cookie expected");
  assert(!JSON.stringify(r.data).includes(token), "token leaked to the client");
  assert((cookies.match(/HttpOnly/gi) || []).length >= 2, "cookies must be HttpOnly");
  assert(/SameSite=lax/i.test(cookies), "SameSite=Lax expected");
});
await check("/api/auth/session returns the user + organization", async () => {
  const r = await admin.json("/api/auth/session");
  eq(r.data.user.name, "ليلى المحمود");
  eq(r.data.organization.name, "منظمة النور");
});
await check("the Authorization: Bearer header reaches the backend", async () => {
  await admin.json("/api/requests?per_page=1");
  const log = await mock.log();
  assert(log.log.some((l) => l.path === "/requests" && l.authorization === `Bearer ${admin.jar.auth_token}`), "no bearer in backend log");
});
await check("/api/login is NOT proxied (would leak the token)", async () => eq((await admin.json("/api/login", { method: "POST", body: { admin_email: "admin@org.org", admin_password: "Passw0rd!" } })).status, 404));
await check("path traversal is rejected", async () => {
  eq((await admin.json("/api/..%2F..%2Fetc%2Fpasswd")).status >= 400, true);
  eq((await admin.json("/api/requests%2F..%2F..%2Fadmin")).status >= 400, true);
});

results.push("D. Onboarding-status routing");
await check("approved user: dashboard pages all load (200)", async () => {
  for (const p of PROTECTED.filter((x) => x.startsWith("/dashboard"))) eq((await admin.req(p)).status, 200, p);
});
await check("approved user is bounced from /onboarding to /dashboard", async () => eq(loc(await admin.req("/onboarding")).pathname, "/dashboard"));
const pending = new Client();
await check("pending-approval user: dashboard -> waiting-approval", async () => {
  eq((await pending.login("pending@org.org")).data.redirect, "/onboarding/waiting-approval");
  eq(loc(await pending.req("/dashboard/requests")).pathname, "/onboarding/waiting-approval");
  eq((await pending.req("/onboarding/waiting-approval")).status, 200);
});
const fresh = new Client();
await check("un-onboarded user: dashboard -> /onboarding; submit flips them to pending approval", async () => {
  eq((await fresh.login("new@org.org")).data.redirect, "/onboarding");
  eq(loc(await fresh.req("/dashboard")).pathname, "/onboarding");
  eq((await fresh.req("/onboarding")).status, 200);

  const bad = await fresh.json("/api/organization/o", { method: "POST", body: { organization_name: "x" } });
  eq(bad.status, 422);
  eq(fresh.jar.onboarding_status, "pending_onboarding", "failed submit must not change status");

  const payload = { organization_name: "مؤسسة جديدة", organization_type: "gov", registration_number: "PS-1", country: "PS", phone: "+970 59 000 0000", email: "new@new.org", contact_person_name: "نورا", sectors: ["health"] };
  const ok = await fresh.json("/api/organization/o", { method: "POST", body: payload });
  eq(ok.status, 201);
  eq(fresh.jar.onboarding_status, "pending_approval");
  eq(loc(await fresh.req("/onboarding")).pathname, "/onboarding/waiting-approval");
  const log = await mock.log();
  eq(log.onboarding.at(-1).organization_name, "مؤسسة جديدة");
  eq((await fresh.json("/api/auth/session")).data.onboarding_status, "pending_approval");
});
await check("platform-admin approval is picked up by the session refresh and unlocks the dashboard", async () => {
  const c = new Client();
  await c.login("pending@org.org");
  eq(loc(await c.req("/dashboard")).pathname, "/onboarding/waiting-approval");
  await fetch(`${API}/__control/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "pending@org.org" }) });
  const s = await c.json("/api/auth/session"); // what the waiting page's "refresh status" button calls
  eq(s.data.onboarding_status, "approved");
  eq(c.jar.onboarding_status, "approved");
  eq((await c.req("/dashboard")).status, 200);
  eq(loc(await c.req("/onboarding/waiting-approval")).pathname, "/dashboard");
});

results.push("E. Every endpoint the dashboard calls works through the proxy");
const ENDPOINTS = [
  "/api/options", "/api/dashboard/summary", "/api/units", "/api/notifications", "/api/requests", `/api/requests/${rid(1)}`, "/api/tasks", "/api/tasks/1",
  "/api/employees", "/api/roles", "/api/permissions", "/api/files/folders", "/api/files", "/api/reports/summary", "/api/reports",
  "/api/meal/stats", "/api/meal/charts?quarter=Q2", "/api/meal/activity", "/api/meal/complaints", "/api/meal/complaints/stats",
  "/api/meal/complaints/insights", "/api/meal/indicators", "/api/meal/indicators/stats", "/api/meal/indicators/insights",
  "/api/meal/reports", "/api/meal/reports/stats", "/api/meal/reports/insights", "/api/meal/report-templates", "/api/meal/field-records",
];
for (const ep of ENDPOINTS) {
  await check(`GET ${ep} -> 200 JSON`, async () => {
    const r = await admin.json(ep);
    eq(r.status, 200);
    assert(r.data && typeof r.data === "object", "expected JSON body");
  });
  await check(`GET ${ep} without a session -> 401`, async () => eq((await new Client().json(ep)).status, 401));
}

results.push("F. Mutations round-trip to the backend");
await mock.reset();
const adm = new Client();
await adm.login("admin@org.org");
await check("requests: list pagination + status filter + counts", async () => {
  const all = await adm.json("/api/requests?per_page=10&page=1");
  eq(all.data.meta.total, 23);
  eq(all.data.data.length, 10);
  eq(all.data.meta.last_page, 3);
  const pend = await adm.json("/api/requests?status=pending");
  assert(pend.data.data.length > 0 && pend.data.data.every((r) => r.status === "pending"), "status filter");
  const s = await adm.json("/api/requests?search=%D8%B1%D9%82%D9%85%2012");
  assert(s.data.data.some((r) => r.code === "REQ-012"), "search");
});
await check("create request: 422 then 201, appears first in the list", async () => {
  eq((await adm.json("/api/requests", { method: "POST", body: { title: "" } })).status, 422);
  // a project is mandatory
  const noProject = await adm.json("/api/requests", { method: "POST", body: { title: "x", type: "مشتريات" } });
  eq(noProject.status, 422);
  assert(noProject.data.errors.project_id?.length, "project_id error expected");
  eq((await adm.json("/api/requests", { method: "POST", body: { title: "x", type: "مشتريات", project_id: 9999 } })).status, 422);
  // the mock rejects amounts > 1,000,000; the real API allows up to 1,000,000,000
  const big = await adm.json("/api/requests", { method: "POST", body: { title: "x", type: "مشتريات", project_id: 1, amount: REAL ? 2_000_000_000 : 5_000_000 } });
  eq(big.status, 422);
  if (REAL) assert(big.data.errors.amount?.length, "amount error expected");
  else eq(big.data.errors.amount, ["المبلغ يتجاوز الحد المسموح"]);
  const created = await adm.json("/api/requests", { method: "POST", body: { title: "طلب E2E", type: "مشتريات", project_id: 1, amount: 2500 } });
  eq(created.status, 201);
  eq(created.data.data.project_id, 1);
  eq((await adm.json("/api/requests?per_page=1")).data.data[0].title, "طلب E2E");
  // separation of duties: the one who submitted it may neither approve nor reject it
  const own = created.data.data.id;
  eq((await adm.json(`/api/requests/${own}/approve`, { method: "POST", body: {} })).status, 403);
  eq((await adm.json(`/api/requests/${own}/reject`, { method: "POST", body: { reason: "x" } })).status, 403);
  eq((await adm.json(`/api/requests/${own}`)).data.data.status, "pending");
});
await check("a task needs a project and a member of its team as assignee", async () => {
  const noProject = await adm.json("/api/tasks", { method: "POST", body: { title: "مهمة" } });
  eq(noProject.status, 422);
  assert(noProject.data.errors.project_id?.length, "project_id error expected");
  eq((await adm.json("/api/tasks", { method: "POST", body: { title: "مهمة", project_id: 1 } })).status, 201);
});
await check("approve / reject / comment / attachment upload + download round-trip", async () => {
  const id = rid(1); // status pending
  const rej = await adm.json(`/api/requests/${id}/reject`, { method: "POST", body: {} });
  eq(rej.status, 422);
  eq((await adm.json(`/api/requests/${id}/approve`, { method: "POST", body: {} })).status, 200);
  eq((await adm.json(`/api/requests/${id}`)).data.data.status, "approved");
  await adm.json(`/api/requests/${id}/comments`, { method: "POST", body: { body: "تعليق E2E" } });
  eq((await adm.json(`/api/requests/${id}`)).data.data.comments[0].body, "تعليق E2E");

  const fd = new FormData();
  fd.append("file", new Blob(["بيانات المرفق"], { type: "text/plain" }), "doc.txt");
  eq((await adm.json(`/api/requests/${id}/attachments`, { method: "POST", body: fd })).status, 201);
  const att = (await adm.json(`/api/requests/${id}`)).data.data.attachments[0];
  const dl = await adm.req(`/api/requests/${id}/attachments/${att.id}/download`);
  eq(dl.status, 200);
  eq(await dl.text(), "بيانات المرفق");
});
await check("create task from request; update task status; comment", async () => {
  const t = await adm.json(`/api/requests/${rid(2)}/tasks`, { method: "POST", body: {} });
  eq(t.status, 201);
  const id = t.data.data.id;
  await adm.json(`/api/tasks/${id}`, { method: "PATCH", body: { status: "done", progress: 100 } });
  const got = (await adm.json(`/api/tasks/${id}`)).data.data;
  eq([got.status, got.progress], ["done", 100]);
});
await check("employees CRUD (create 201, duplicate 422, update, delete 204)", async () => {
  const c = await adm.json("/api/employees", { method: "POST", body: { name: "ريما", email: "rima@org.org", role_id: 1, status: "active" } });
  eq(c.status, 201);
  eq((await adm.json("/api/employees", { method: "POST", body: { name: "ريما 2", email: "rima@org.org" } })).status, 422);
  eq((await adm.json(`/api/employees/${c.data.data.id}`, { method: "PUT", body: { name: "ريما المعدّلة" } })).status, 200);
  const del = await adm.req(`/api/employees/${c.data.data.id}`, { method: "DELETE" });
  eq(del.status, 204);
  assert(!(await adm.json("/api/employees")).data.data.some((e) => e.email === "rima@org.org"), "should be deleted");
});
await check("units toggle, notifications read, file upload/download", async () => {
  eq((await adm.json("/api/units/2", { method: "PATCH", body: { enabled: true } })).status, 200);
  eq((await adm.json("/api/units")).data.data.find((u) => u.id === 2).status, "active");
  eq((await adm.json("/api/units/3", { method: "PATCH", body: { enabled: true } })).status, 422);
  await adm.json("/api/notifications/read-all", { method: "POST", body: {} });
  assert((await adm.json("/api/notifications")).data.data.every((n) => n.is_read), "all read");
  const loose = new FormData();
  loose.append("file", new Blob(["x"]), "loose.bin");
  eq((await adm.json("/api/files", { method: "POST", body: loose })).status, 422); // a file always goes into a folder
  const fd = new FormData();
  fd.append("file", new Blob(["file-bytes"]), "up.bin");
  fd.append("folder_id", "1");
  eq((await adm.json("/api/files", { method: "POST", body: fd })).status, 201);
  const files = (await adm.json("/api/files?folder_id=1")).data.data;
  const up = files.find((f) => f.name === "up.bin");
  eq(await (await adm.req(`/api/files/${up.id}/download`)).text(), "file-bytes");
});
await check("MEAL: complaint create/patch, indicator create (dup 422)/patch, report status, field record submit updates the indicator", async () => {
  eq((await adm.json("/api/meal/complaints", { method: "POST", body: { type: "نوع", project_id: 1, priority: "sensitive", channel: "الهاتف" } })).status, 201);
  const noProject = await adm.json("/api/meal/complaints", { method: "POST", body: { type: "نوع", channel: "الهاتف" } }); // MEAL data belongs to a project
  eq(noProject.status, 422);
  assert(noProject.data.errors.project_id?.length, "project_id error expected");
  eq((await adm.json("/api/meal/complaints/1", { method: "PATCH", body: { status: "resolved" } })).status, 200);
  const sens = await adm.json("/api/meal/complaints?status=sensitive");
  assert(sens.data.data.every((c) => c.priority === "sensitive"), "sensitive filter");
  eq((await adm.json("/api/meal/indicators", { method: "POST", body: { code: "IND-1.1", name: "dup" } })).status, 422);
  eq((await adm.json("/api/meal/indicators", { method: "POST", body: { code: "NEW-1", name: "جديد", project_id: 1, target: 10 } })).status, 201);
  await adm.json("/api/meal/indicators/1", { method: "PATCH", body: { achieved: 100 } });
  eq((await adm.json("/api/meal/indicators?status=achieved")).data.data.some((i) => i.id === 1), true);
  await adm.json("/api/meal/reports/1", { method: "PATCH", body: { status: "approved" } });
  const before = (await adm.json("/api/meal/indicators")).data.data.find((i) => i.id === 2).achieved;
  const fd = new FormData();
  Object.entries({ project_id: "2", sector: "المياه", activity_type: "توزيع مساعدات", region: "غزة", activity_date: "2026-05-05", title: "نشاط E2E", indicator_id: "2", achieved_value: "25", total_beneficiaries: "40", status: "submitted" }).forEach(([k, v]) => fd.append(k, v));
  fd.append("attachments[]", new Blob(["%PDF-x"], { type: "application/pdf" }), "p.pdf"); // the real API checks the content, not the name
  eq((await adm.json("/api/meal/field-records", { method: "POST", body: fd })).status, 201);
  eq((await adm.json("/api/meal/indicators")).data.data.find((i) => i.id === 2).achieved, before + 25);
  eq((await adm.json("/api/meal/activity?type=activity")).data.data[0].title, "نشاط E2E");
});
await check("backend failure (500) is passed to the client intact; the next call recovers", async () => {
  await mock.fail({ method: "GET", path: "/requests", status: 500, message: "Server Error", times: 1 });
  const r = await adm.json("/api/requests");
  eq(r.status, 500);
  eq(r.data.message, "Server Error");
  eq((await adm.json("/api/requests")).status, 200);
});
await check("backend 401 (expired token) clears the session cookie", async () => {
  const c = new Client();
  await c.login("admin@org.org");
  await mock.fail({ method: "GET", path: "/requests", status: 401, message: "Unauthenticated.", times: 1 });
  eq((await c.json("/api/requests")).status, 401);
  assert(!c.jar.auth_token, "cookie should be cleared");
  eq(loc(await c.req("/dashboard")).pathname, "/login");
});
await check("logout revokes server-side, clears cookies, and the dashboard is blocked again", async () => {
  const c = new Client();
  await c.login("admin@org.org");
  eq((await c.req("/dashboard")).status, 200);
  await c.json("/api/auth/logout", { method: "POST" });
  assert(!c.jar.auth_token && !c.jar.onboarding_status, "cookies cleared");
  eq(loc(await c.req("/dashboard")).pathname, "/login");
  assert((await mock.log()).log.some((l) => l.path === "/logout"), "backend /logout not called");
});

results.push("G. Employee invitation (e-mailed code -> /api/auth/set-password)");
await mock.reset();
const boss = new Client();
await boss.login("admin@org.org");
const NEW_PW = "N3w!Password";
const setPw = (email, code, over = {}) =>
  anon.json("/api/auth/set-password", { method: "POST", body: { email, code, password: NEW_PW, password_confirmation: NEW_PW, ...over } });
const addEmployee = (email, over = {}) => boss.json("/api/employees", { method: "POST", body: { name: "موظف مدعو", email, status: "active", ...over } });
const bad = (code) => (code === "000000" ? "000001" : "000000");
let invitee;
await check("adding an employee e-mails an invitation code (never returned by the API) and marks them pending", async () => {
  const r = await addEmployee("invitee@org.org");
  eq(r.status, 201);
  eq(r.data.data.invite_pending, true);
  const code = await otpFor("invitee@org.org");
  assert(/^\d{6}$/.test(code), "a 6-digit invitation code was e-mailed");
  assert(!JSON.stringify(r.data).includes(code), "the code must not be in the response");
  invitee = r.data.data;
});
await check("set-password: malformed codes, weak passwords and mismatches are 422 and use up no attempt", async () => {
  const code = await otpFor("invitee@org.org");
  for (const c of ["", "12345", "12a456"]) {
    const r = await setPw("invitee@org.org", c);
    eq(r.status, 422, `code=${JSON.stringify(c)}`);
    assert(r.data.errors?.code?.length, "field error on code");
  }
  const weak = await setPw("invitee@org.org", code, { password: "weak", password_confirmation: "weak" });
  eq(weak.status, 422);
  assert(weak.data.errors?.password?.length, "field error on password");
  assert((await setPw("invitee@org.org", code, { password_confirmation: "Other1!pass" })).data.errors?.password?.length, "mismatch is a password error");
});
await check("set-password: a wrong code is 422 on `code`; verify-email cannot be used to burn the invitation; nobody can sign in yet", async () => {
  const code = await otpFor("invitee@org.org");
  const r = await setPw("invitee@org.org", bad(code));
  eq(r.status, 422);
  assert(r.data.errors?.code?.length, "field error on code");
  eq((await anon.json("/api/auth/verify-email", { method: "POST", body: { email: "invitee@org.org", code } })).status, 422, "the invitation code is not an e-mail verification code");
  eq((await new Client().login("invitee@org.org", NEW_PW)).status, 401);
});
await check("the public resend does not serve invitations (answers 200, mails nothing)", async () => {
  const before = (await mailTo("invitee@org.org")).length;
  eq((await anon.json("/api/auth/resend-verification", { method: "POST", body: { email: "invitee@org.org" } })).status, 200);
  eq((await mailTo("invitee@org.org")).length, before);
});
await check("set-password with the right code activates the account; the code is single-use; the employee can sign in", async () => {
  const code = await otpFor("invitee@org.org");
  const ok = await setPw("invitee@org.org", code);
  eq(ok.status, 200);
  eq(ok.data.activated, true);
  assert(!JSON.stringify(ok.data).includes(NEW_PW), "the password is never echoed");
  eq((await setPw("invitee@org.org", code, { password: "An0ther!Pass", password_confirmation: "An0ther!Pass" })).status, 422, "single use");
  const emp = new Client();
  eq((await emp.login("invitee@org.org", NEW_PW)).status, 200);
  eq((await emp.json("/api/auth/session")).data.user.name, "موظف مدعو");
  eq((await new Client().login("invitee@org.org", "An0ther!Pass")).status, 401, "the second password was never set");
  const listed = (await boss.json("/api/employees")).data.data.find((e) => e.email === "invitee@org.org");
  eq(listed.invite_pending, false);
});
await check("an invitation for an already activated employee cannot be re-sent (409); needs a session (401)", async () => {
  eq((await boss.json(`/api/employees/${invitee.id}/invite`, { method: "POST", body: {} })).status, 409);
  eq((await anon.json(`/api/employees/${invitee.id}/invite`, { method: "POST", body: {} })).status, 401);
});
await check("five wrong codes lock the invitation (429, even for the right code); the admin's re-send issues a fresh code that works", async () => {
  const r = await addEmployee("lockme@org.org");
  eq(r.status, 201);
  const good = await otpFor("lockme@org.org");
  for (let i = 1; i <= 5; i++) eq((await setPw("lockme@org.org", bad(good))).status, 422, `attempt ${i}`);
  const locked = await setPw("lockme@org.org", good);
  eq(locked.status, 429);
  assert(locked.data.message.includes("رمزاً جديداً"), "tells the user to request a new code");

  const before = (await mailTo("lockme@org.org")).length;
  const resent = await boss.json(`/api/employees/${r.data.data.id}/invite`, { method: "POST", body: {} });
  eq(resent.status, 200);
  assert(!/\d{6}/.test(JSON.stringify(resent.data)), "the new code is not in the response");
  eq((await mailTo("lockme@org.org")).length, before + 1);
  const fresh = await otpFor("lockme@org.org");
  if (REAL && fresh !== good) eq((await setPw("lockme@org.org", good)).status, 422, "the old code is dead");
  eq((await setPw("lockme@org.org", fresh)).status, 200);
});

results.push("H. Platform operators have their own page, not the (403-ing) dashboard");
await mock.reset();
const ops = new Client();
await check("operator login -> redirect /operator, status cookie 'operator', the flag reaches the client, no token in the body", async () => {
  const r = await ops.login("ops@masar.io");
  eq(r.status, 200);
  eq(r.data.redirect, "/operator");
  eq(r.data.onboarding_status, "operator");
  eq(ops.jar.onboarding_status, "operator");
  eq(r.data.user.is_platform_admin, true);
  assert(!JSON.stringify(r.data).includes(ops.jar.auth_token), "token leaked to the client");
});
await check("an operator cannot open the dashboard or onboarding (307 -> /operator); /operator itself is 200", async () => {
  for (const p of ["/dashboard", "/dashboard/requests", "/dashboard/meal", "/onboarding", "/onboarding/waiting-approval"]) {
    const r = await ops.req(p);
    eq(r.status, 307, p);
    eq(loc(r).pathname, "/operator", p);
  }
  eq((await ops.req("/operator")).status, 200);
});
await check("organization users are sent home from /operator (approved -> dashboard, pending -> waiting screen)", async () => {
  const org = new Client();
  await org.login("admin@org.org");
  eq(loc(await org.req("/operator")).pathname, "/dashboard");
  const waiting = new Client();
  await waiting.login("pending@org.org");
  eq(loc(await waiting.req("/operator")).pathname, "/onboarding/waiting-approval");
});
await check("a forged 'operator' cookie without a token grants nothing", async () => {
  const c = new Client();
  c.jar.onboarding_status = "operator";
  eq(loc(await c.req("/operator")).pathname, "/login");
});
await check("a session made before the operator page existed (cookie still 'approved') is repaired by the next session refresh", async () => {
  const c = new Client();
  await c.login("ops@masar.io");
  c.jar.onboarding_status = "approved";
  eq((await c.req("/dashboard")).status, 200); // the stale cookie lets the page shell load...
  const s = await c.json("/api/auth/session");
  eq(s.data.onboarding_status, "operator"); // ...but the session call tells the truth
  eq(c.jar.onboarding_status, "operator");
  eq(loc(await c.req("/dashboard")).pathname, "/operator");
});
if (REAL) {
  await check("the real backend refuses the operator's business API calls (403) but serves /platform/organizations", async () => {
    eq((await ops.json("/api/requests")).status, 403);
    eq((await ops.json("/api/employees")).status, 403);
    eq((await ops.json("/api/platform/organizations")).status, 200);
  });
}

results.push("I. The visitor's real address reaches the backend (per-IP rate limits)");
if (!REAL) {
  results.push("  (skipped: the mock backend has no rate limits)");
} else {
  const lastIp = async (path) => (await mock.log()).log.filter((l) => l.path === path).at(-1)?.ip;
  const proxied = (xff) => ({ "X-Forwarded-For": xff });
  await check("public traffic: the address the proxy appended is what the backend sees; forged entries to its left are ignored", async () => {
    await anon.json("/api/auth/verify-email", { method: "POST", body: { email: "ip-test@x.org", code: "123456" }, headers: proxied("6.6.6.6, 203.0.113.7") });
    eq(await lastIp("/auth/verify-email"), "203.0.113.7");
  });
  await check("login and the session refresh carry it too", async () => {
    const c = new Client();
    await c.json("/api/auth/login", { method: "POST", body: { email: "admin@org.org", password: "Passw0rd!" }, headers: proxied("198.51.100.20") });
    eq(await lastIp("/login"), "198.51.100.20");
    await c.json("/api/auth/session", { headers: proxied("198.51.100.21") });
    eq(await lastIp("/auth/me"), "198.51.100.21");
    await c.json("/api/requests?per_page=1", { headers: proxied("198.51.100.22") });
    eq(await lastIp("/requests"), "198.51.100.22");
  });
  await check("a malformed value is dropped: the backend sees the Next.js server (loopback), never what the visitor typed", async () => {
    await anon.json("/api/auth/verify-email", { method: "POST", body: { email: "ip-test2@x.org", code: "123456" }, headers: proxied("203.0.113.7, evil.example") });
    const ip = await lastIp("/auth/verify-email");
    assert(/^(::ffff:)?127\.0\.0\.1$|^::1$/.test(ip), `expected loopback, got ${ip}`);
  });
}

results.push("J. Forgot password (e-mailed code -> /api/auth/reset-password)");
await mock.reset();
const FG = { ...REG, organization_name: "مؤسسة النسيان", organization_email: "info@forget-org.org", admin_email: "forgetful@test-org.org" };
const forgotPw = (email) => anon.json("/api/auth/forgot-password", { method: "POST", body: { email } });
const resetPw = (code, over = {}) =>
  anon.json("/api/auth/reset-password", { method: "POST", body: { email: FG.admin_email, code, password: NEW_PW, password_confirmation: NEW_PW, ...over } });
await check("setup: a registered, e-mail-verified account (and an unverified one)", async () => {
  eq((await anon.json("/api/auth/register", { method: "POST", body: FG })).status, 201);
  eq((await anon.json("/api/auth/verify-email", { method: "POST", body: { email: FG.admin_email, code: await otpFor(FG.admin_email) } })).status, 200);
  eq((await anon.json("/api/auth/register", { method: "POST", body: { ...FG, admin_email: "unverified2@test-org.org" } })).status, 201);
});
await check("forgot-password answers identically for unknown, unverified and verified addresses; only the verified account gets a code (never in the response)", async () => {
  const ghost = await forgotPw("ghost@nowhere.org");
  eq(ghost.status, 200);
  const before = (await mailTo(FG.admin_email)).length;
  const known = await forgotPw(FG.admin_email);
  eq(known.status, 200);
  eq(known.data, ghost.data, "the answer must not depend on the address");
  eq((await mailTo(FG.admin_email)).length, before + 1, "one reset e-mail");
  const code = await otpFor(FG.admin_email);
  assert(/^\d{6}$/.test(code), "a 6-digit code was e-mailed");
  assert(!JSON.stringify(known.data).includes(code), "the code must not be in the response");
  const unverified = (await mailTo("unverified2@test-org.org")).length;
  eq((await forgotPw("unverified2@test-org.org")).data, ghost.data);
  eq((await mailTo("unverified2@test-org.org")).length, unverified, "nothing is mailed to an unverified account");
  eq((await mailTo("ghost@nowhere.org")).length, 0);
  eq((await anon.json("/api/auth/forgot-password", { method: "POST", body: { email: "nope" } })).status, 422);
});
await check("reset-password: malformed codes, weak passwords and mismatches are 422 and spend no attempt; a reset code is not a verification code", async () => {
  const code = await otpFor(FG.admin_email);
  for (const c of ["", "12345", "12a456"]) {
    const r = await resetPw(c);
    eq(r.status, 422, `code=${JSON.stringify(c)}`);
    assert(r.data.errors?.code?.length, "field error on code");
  }
  const weak = await resetPw(code, { password: "weak", password_confirmation: "weak" });
  eq(weak.status, 422);
  assert(weak.data.errors?.password?.length, "field error on password");
  assert((await resetPw(code, { password_confirmation: "Other1!pass" })).data.errors?.password?.length, "mismatch is a password error");
  eq((await anon.json("/api/auth/verify-email", { method: "POST", body: { email: FG.admin_email, code } })).status, 422);
  const wrongCode = await resetPw(bad(code));
  eq(wrongCode.status, 422);
  assert(wrongCode.data.errors?.code?.length, "field error on code");
});
await check("the right code changes the password, ENDS EVERY SESSION and is single-use; the old password is dead", async () => {
  const device = new Client();
  eq((await device.login(FG.admin_email, FG.admin_password)).status, 200);
  eq((await device.json("/api/auth/session")).status, 200);
  const code = await otpFor(FG.admin_email);

  const ok = await resetPw(code);
  eq(ok.status, 200);
  eq(ok.data.reset, true);
  assert(!JSON.stringify(ok.data).includes(NEW_PW), "the password is never echoed");
  eq((await device.json("/api/auth/session")).status, 401, "the session opened before the reset is dead");
  eq((await new Client().login(FG.admin_email, FG.admin_password)).status, 401, "the old password no longer works");
  eq((await new Client().login(FG.admin_email, NEW_PW)).status, 200);
  eq((await resetPw(code, { password: "An0ther!Pass", password_confirmation: "An0ther!Pass" })).status, 422, "single use");
  const notice = (await mailTo(FG.admin_email)).at(-1);
  assert(!/\d{6}/.test(notice.text), "the 'password changed' notice contains no code");
});
await check("five wrong codes lock it (429, even for the right code); asking again gives a fresh code that works", async () => {
  eq((await forgotPw(FG.admin_email)).status, 200);
  const good = await otpFor(FG.admin_email);
  const third = { password: "Th1rd!Password", password_confirmation: "Th1rd!Password" };
  for (let i = 1; i <= 5; i++) eq((await resetPw(bad(good), third)).status, 422, `attempt ${i}`);
  const locked = await resetPw(good, third);
  eq(locked.status, 429);
  assert(locked.data.message.includes("رمزاً جديداً"), "tells the user to request a new code");
  eq((await forgotPw(FG.admin_email)).status, 200);
  eq((await resetPw(await otpFor(FG.admin_email), third)).status, 200);
  eq((await new Client().login(FG.admin_email, "Th1rd!Password")).status, 200);
});

// ---------------------------------------------------------------- report A
console.log(results.join("\n"));
console.log(`\nHTTP checks: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:\n" + failures.map((f) => " - " + f).join("\n"));
  stopAll();
  process.exit(1);
}

// ------------------------------------------------------------ B. Playwright
if (httpOnly) { stopAll(); process.exit(0); }
const pw = spawn(process.execPath, ["node_modules/playwright/cli.js", "test", ...(process.env.E2E_GREP ? ["-g", process.env.E2E_GREP] : [])], {
  cwd: ROOT,
  env: { ...process.env, E2E_APP_PORT: APP_PORT, MOCK_PORT: API_PORT },
  stdio: "inherit",
});
pw.on("exit", (code) => { stopAll(); process.exit(code ?? 1); });
