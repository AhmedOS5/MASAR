# MASAR backend

REST API for the MASAR frontend. **Node 22+** (developed on 24) · **Fastify 5** · **Knex** (SQLite for development/tests,
PostgreSQL for production) · **Zod** · Vitest. Implements [`docs/api-contracts.md`](../docs/api-contracts.md); the rules it enforces
(auth, permissions, lifecycle, uploads, notifications) are in [`docs/backend-rules.md`](../docs/backend-rules.md).

The browser never calls this API: the Next.js app's server-side proxy (BFF) keeps the token in an HttpOnly cookie and forwards it
as `Authorization: Bearer <token>`. The backend therefore sets no cookies and needs no CORS.

```
Browser ──▶ Next.js :3000 (/api/* BFF) ──Bearer──▶ this API :4010 ──▶ SQLite file (dev) / PostgreSQL (prod)
```

## Quick start (development)
```bash
cd backend
npm install
cp .env.example .env     # optional — the defaults work for local SQLite
npm run migrate          # create the schema (data/masar.sqlite)
npm run seed             # demo data (see "Demo data")
npm run dev              # http://localhost:4010  (auto-restarts on file changes)
```
Point the frontend at it (`frontend/.env.local`): `API_URL=http://localhost:4010`, then `npm run dev` inside `frontend/` (port 3000).
Check it: `curl http://localhost:4010/health` → `{"status":"ok"}`.

**Ports:** API `4010` (`PORT`) · frontend dev `3000` · e2e: API `4010` / app `3100` by default (override with `MOCK_PORT` /
`E2E_APP_PORT`; the e2e runner refuses to start if a port is busy — e.g. while `npm run dev` is using 4010).

## Scripts
| Script | Purpose |
|---|---|
| `npm run dev` / `npm start` | run the server (`dev` restarts on change). It refuses to start while migrations are pending |
| `npm run migrate` / `npm run migrate:rollback` | apply / undo the latest migration batch (`migrations/`) |
| `npm run seed` | run `seeds/` — demo data, **idempotent**, skipped in production |
| `npm run db:reset` | wipe uploads, roll back everything, migrate, seed (**refused in production; destroys the dev database**) |
| `node scripts/db.mjs status` | applied / pending migration counts |
| `npm run cli -- <command>` | platform-operator CLI (below) |
| `npm test` / `npm run test:watch` | Vitest (499 tests, in-memory SQLite, ~1 min) |

## Environment variables
Validated at start-up (`src/config/env.js`); a bad value stops the process with a clear message. Load from `.env` (see `.env.example`).

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` turns on the extra checks below |
| `HOST` / `PORT` | `0.0.0.0` / `4010` | |
| `LOG_LEVEL` | `info` | `silent` … `trace`; `NODE_ENV=test` disables the logger. `Authorization`/`Cookie` are redacted |
| `DATABASE_URL` | *(empty)* | `postgres://user:pass@host:5432/masar` → PostgreSQL; empty → SQLite file. **Required in production** |
| `SQLITE_PATH` | `data/masar.sqlite` | relative to `backend/` |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | used for the login link in e-mails only (no CORS) |
| `SIGNING_SECRET` | dev-only constant | server secret that keys the hash of verification codes. **≥ 32 chars, required in production** (`openssl rand -hex 32`) |
| `TOKEN_TTL_DAYS` | `30` | bearer token lifetime |
| `EMAIL_OTP_TTL_MINUTES` | `15` | how long a 6-digit verification code is valid |
| `EMAIL_OTP_MAX_ATTEMPTS` | `5` | wrong submissions allowed per code before it is invalidated (`429`) |
| `EMAIL_OTP_RESEND_COOLDOWN_SECONDS` | `60` | minimum wait between two codes for the same address (`0` disables; the e2e suite uses `0`) |
| `INVITE_TTL_HOURS` | `48` | how long the **employee invitation code** (e-mailed when an admin adds an employee; entered on `/set-password`) is valid. Same 5-attempt rule; only an admin can re-issue it |
| `SCRYPT_LOG_N` | `15` | password-hash cost (log2 N, 10–20); tests/e2e use 10 |
| `RATE_LIMIT_SCALE` | `1` | multiplies every login/register/resend limit — keep `1` in production |
| `UPLOAD_DIR` | `data/uploads` | **local disk only** (no S3 driver yet) — use a persistent volume in production |
| `MAX_UPLOAD_MB` | `10` | per-file cap for attachments, files, reports, imports |
| `SMTP_HOST` | *(empty)* | **setting it turns real e-mail delivery on automatically.** Empty = development fallback: nothing is sent and the code is printed to the server console. Required in production |
| `SMTP_PORT` | `587` | `587` (STARTTLS) or `465` (implicit TLS) |
| `SMTP_SECURE` | `false` | `true` = implicit TLS (use with port 465); `false` = STARTTLS when the server offers it |
| `SMTP_USER` / `SMTP_PASS` | *(empty)* | credentials; no authentication is attempted when `SMTP_USER` is empty (open relay) |
| `SMTP_FROM` | `MASAR <no-reply@masar.local>` | sender shown to the user — use an address your SMTP account is allowed to send as |
| `MAIL_TRANSPORT` | `auto` | `auto` (SMTP when `SMTP_HOST` is set, else console), `console`, `smtp`, `none` (drop mail) |
| `TRUST_PROXY` | `false` | whose `X-Forwarded-For` to believe, so the per-IP rate limits see the **visitor**, not the Next.js server. `false`, `true`, or — **recommended** — a comma-separated list of addresses / CIDR ranges / `loopback` / `linklocal` / `uniquelocal` (e.g. `10.0.0.0/8`). See [Real client addresses](#real-client-addresses-trust_proxy) |
| `ENABLE_TEST_CONTROLS` | `false` | exposes `/__control/*` for the e2e suite (**refused when `NODE_ENV=production`**) |

Production checks (the process refuses to start otherwise): `SIGNING_SECRET` ≥ 32 chars, a `postgres://` `DATABASE_URL`, **`SMTP_HOST`
set** (codes are only ever delivered by e-mail), and `ENABLE_TEST_CONTROLS` off. At start-up the server logs how mail is delivered and,
with SMTP, checks the connection and credentials (a failure is logged loudly but does not stop the server).

### E-mail verification (6-digit code)
1. `POST /auth/register` creates the organization and admin, generates a **6-digit code** (CSPRNG, zero-padded) and e-mails it.
2. Only a **keyed hash** (HMAC-SHA256 with `SIGNING_SECRET`) is stored, with an expiry (15 min) — never the code itself.
3. The user types it on `/verify-email` → `POST /auth/verify-email { email, code }`. After **5 wrong attempts** the code is invalidated (`429`).
4. **Resend code** (`POST /auth/resend-verification { email }`) invalidates the previous code, issues a new one and resets the attempts;
   a 60 s cooldown and 3 codes / 10 min / address apply.
5. Until verified, `POST /login` answers `403`; the login screen then links to the code screen.

**Development/demo fallback:** without `SMTP_HOST` nothing is sent; whenever `NODE_ENV` is not `production` (and `LOG_LEVEL` is not `silent`)
the code is **printed to the server console** in a clearly marked box, so you can register and verify live without a mail server:
```
┌──────────── MASAR · e-mail verification code (OTP) ────────────
│ e-mail : owner@org.org
│ code   : 482915
│ valid  : 15 minutes   (printed because NODE_ENV is not production)
└────────────────────────────────────────────────────────────────
```
In production the code is never printed or returned by the API.

**Real e-mail with Gmail** (any SMTP provider works the same way): enable 2-step verification, create an *app password*, then
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=<16-character app password>
SMTP_FROM="MASAR <you@gmail.com>"
```
Port 465 needs `SMTP_SECURE=true`. If delivery fails the registration still succeeds (the error is logged) and the user can press "Resend code".

## Demo data
`npm run seed` (or `db:reset`) creates a fixture that mirrors the legacy mock API, so the frontend works against it out of the box:
23 requests, 12 tasks, 14 complaints, 6 indicators, 5 MEAL reports, 2 files, 1 report, 3 notifications, three organizations in
different onboarding states and two projects (`PRJ-001` مشروع ألف, `PRJ-002` مشروع باء) that every request, task, folder, file, report
and MEAL record belongs to (see [docs/demo-accounts.md](../docs/demo-accounts.md)). **Every account's password is `Passw0rd!`** (never run the seed in production — it is skipped there).

| Login | Role |
|---|---|
| `admin@org.org` | system admin of «منظمة النور» (approved) — sees everything |
| `jalal@org.org` | researcher in the same organization: `tasks.view` only |
| `pending@org.org` | admin of an organization in `pending_approval` |
| `new@org.org` | admin of an organization that has not finished onboarding (`incomplete`) |
| `ops@masar.io` | platform operator (approves organizations) |

Other employees (`mona@org.org`, `hala@org.org`, `salma@org.org`, `dalia@org.org`) are directory entries **without** a login.

## Platform operator CLI
Registered organizations wait in `pending_approval` until MASAR staff decide. Run from `backend/`:
```bash
npm run cli -- create-platform-admin --email ops@masar.io --name "Ops"   # password from $PLATFORM_ADMIN_PASSWORD, else generated and printed once
npm run cli -- orgs --status pending_approval                            # list (optional --search text)
npm run cli -- show 12                                                  # profile + uploaded documents
npm run cli -- approve 12                                               # notifies members, e-mails the admins
npm run cli -- reject 12 --reason "الوثائق غير مكتملة"                   # reason required, e-mailed
npm run cli -- suspend 12 --reason "…"                                  # reason optional
```
The first operator can only be created with the CLI. The same decisions are available over HTTP to a logged-in operator
(`POST /login`, then `GET /platform/organizations`, `POST /platform/organizations/{id}/approve|reject|suspend` — see the API doc).
Lifecycle and what each state allows: [`docs/backend-rules.md` §2](../docs/backend-rules.md).

## Testing
| What | Command | Result (last run) |
|---|---|---|
| Backend unit + integration | `cd backend && npm test` | 499 / 499 (2026-11-18; also 499 on PostgreSQL 17 with `TEST_DATABASE_URL`) |
| Frontend unit + component | `cd frontend && npm test` | 446 / 446 (2026-11-18) |
| HTTP e2e vs this backend | `cd frontend && npm run build:e2e && npm run e2e:real` | 143 / 143 on 2026-11-16, not re-run since |
| Browser e2e (Chromium) vs this backend | same command | 40 / 40 on 2026-11-16, not re-run since |

Run the backend and frontend suites one after the other, not together: on a busy machine some frontend tests time out.

`npm run e2e:real` (run in `frontend/`) starts this backend on a temporary SQLite file (`frontend/.e2e-data/`) with `ENABLE_TEST_CONTROLS=true`, then the
production build of the app, then runs the same HTTP + Playwright suite as `npm run e2e` (which uses the mock API). The control plane —
`POST /__control/reset` (restore the demo fixture), `GET /__control/log` (requests seen), `POST /__control/fail` (inject errors),
`POST /__control/approve`, `GET /__control/state`, `GET /__control/mail` — mirrors the mock's controls. Tests that depend on
values the mock fabricates (dashboard numbers, `R-n` ids, forged verification signatures) read them from the real API instead.
Set `E2E_VERBOSE=1` to see server output; `E2E_GREP="text"` runs matching browser tests only.

## Production notes
* Run `npm run migrate` on every deploy (the server will not start with pending migrations); create the first platform operator with the CLI.
* Serve it behind TLS (the BFF's cookie is `Secure` in production) and **set `TRUST_PROXY`** (below) — production logs a warning at start-up if it is unset or `true`.
* **PostgreSQL:** the backend suite passes on PostgreSQL 17 as well (`TEST_DATABASE_URL=postgres://user:pass@localhost:5432/postgres npm test` — each
  test gets its own throw-away database, dropped afterwards). Set `DATABASE_URL=postgres://…` and run `npm run migrate` to use it; the e2e against
  PostgreSQL has not been run yet.
* Uploads are stored on local disk (`UPLOAD_DIR`): mount persistent storage or add a storage driver (`src/lib/storage.js` is the interface).
* Per-identity rate limits are in memory (per process); behind several instances use a shared store.
* CI (`.github/workflows/ci.yml`, Node 22): this suite on SQLite and on PostgreSQL 17, plus the frontend lint/tests/build. Not in CI yet: the e2e suites. Open items and limits: [`docs/backend-rules.md` §10](../docs/backend-rules.md).

### Real client addresses (`TRUST_PROXY`)
Browsers never talk to this API: the Next.js server does. Every request therefore arrives from **one** address, and without
help every visitor would share every per-IP rate limit (10 registrations / 10 min, 30 logins / 5 min …) — one noisy visitor
could lock everybody out. The fix has two halves that must agree:

1. **The Next.js server** works out the visitor's address and forwards it as `X-Forwarded-For` (login, session, logout and every
   proxied call; *never* to the AI assistant). It believes only what **its own** reverse proxy appended —
   `TRUSTED_PROXY_HOPS` proxies from the right; anything the visitor wrote to the left is ignored. Default `0` (nothing is
   forwarded), `1` on Vercel. See the frontend `.env.example`.
2. **This API** believes that header only from the peer that sent it — `TRUST_PROXY`:

| Where the Next.js server runs | `TRUST_PROXY` |
|---|---|
| same machine / container host | `loopback` |
| a private network that nothing else can enter (VPC, docker network, k8s) | its range, e.g. `10.0.0.0/8` (+ `fd00::/8`) |
| anywhere else, with the API reachable **only** through it (firewall / security group / private link) | its address, or `true` |
| a PaaS with changing egress addresses (e.g. Vercel → a public API) | see the caveat below |

**Why a list and not `true`:** `true` believes everyone, and Fastify then takes the *leftmost* entry — which a client that can reach
this API directly writes itself. It could pick a fresh "address" per request and never hit a per-IP limit (a test documents this).
A list ignores `X-Forwarded-For` from every other peer. Garbage values are rejected at start-up (a typo never silently disables the
protection).

**Caveat:** if the API is public *and* the Next.js server's address cannot be pinned, `TRUST_PROXY=true` is the only way to get
per-visitor limits, and anyone calling the API directly can evade the **per-IP** ceilings. The **per-identity** limits (5 failed
logins / e-mail, 5 attempts / code, resend cooldowns) do not depend on addresses and still hold. Prefer closing the API to the
public (allow-list the Next.js server, or put both on a private network).

## Layout
```
backend/
├── migrations/      12 files: identity · workspace · MEAL · units catalog · completed_at/folders · indicator_updates/templates · email_otp · volunteers drop · job roles · projects · mandatory project · MEAL projects
├── seeds/01_demo.js demo fixture (src/demo/seed.js)          scripts/  db.mjs (migrate/seed/reset) · cli.mjs (operator CLI)
├── src/
│   ├── server.js app.js          entry point · app factory (buildApp, used by the tests too)
│   ├── config/env.js             validated environment          db/  knex factory (SQLite | PostgreSQL)
│   ├── lib/                      errors · validate (Zod → 422) · pagination · sequence (REQ-001) · password · otp · tokens ·
│   │                             limiter · mailer · storage · uploads (content sniffing) · csv · http-files
│   ├── plugins/                  errors (JSON error shapes) · auth (Bearer + app.guard({ permission, allowUnapproved, platformAdmin }))
│   ├── modules/                  auth · organizations · platform · lookups · dashboard · units · notifications · requests · tasks ·
│   │                             people (employees + roles) · files · reports · meal/* · shared · health
│   ├── demo/seed.js              fixture + wipeData()     testing/controls.js   e2e control plane (only when enabled)
└── test/                         Vitest; each test builds the app on an in-memory SQLite (test/helpers.js)
```
Conventions: every business table has `organization_id` and every query is scoped by it; services throw `HttpError` /
`ValidationError` (never write replies); repository code stays dialect-portable (no JSON columns, no engine-specific SQL);
routes declare their permission with `app.guard(...)`; file types are decided by content, never by name.
