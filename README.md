# مَسَار | MASAR

Digital workspace for NGOs: landing site → organization registration → e-mail verification → onboarding → operations dashboard
(requests, tasks, employees, roles, files, reports, units, notifications and the **MEAL** Monitoring-Evaluation-Accountability-Learning
module). Arabic / RTL. This repository holds two independent packages, each with its own `package.json`, dependencies and tests:
the **frontend** (`frontend/`) and the **backend API** (`backend/`).

```
.
├── frontend/   Next.js app (src/, public/, e2e/, scripts/, configs, .env.example)
├── backend/    Fastify API (src/, migrations/, seeds/, test/, scripts/)
├── docs/       shared documentation (API contract, backend rules, architecture, roadmap)
└── .github/    CI workflows (run inside frontend/ — see below)
```

| Part | Stack |
|---|---|
| Frontend (`frontend/`) | Next.js 16 (App Router) · React 19 · TanStack Query · CSS Modules · Vitest · Playwright |
| Backend (`backend/`) | Node 22+ · Fastify 5 · Knex (SQLite dev/tests, PostgreSQL prod) · Zod · Vitest |

```
Browser ──▶ Next.js :3000  (/api/* proxy = BFF, token in an HttpOnly cookie) ──Bearer──▶ backend :4010
```
The browser only talks to its own origin. The BFF adds `Authorization: Bearer <token>` from the `auth_token` cookie; the backend sets no
cookies and needs no CORS.

## Quick start
```bash
# 1. backend (SQLite, demo data)
cd backend && npm install && npm run migrate && npm run seed && npm run dev      # http://localhost:4010

# 2. frontend (new terminal)
cd frontend
npm ci
cp .env.example .env.local        # set API_URL=http://localhost:4010
npm run dev                       # http://localhost:3000
```
Log in with **`admin@org.org` / `Passw0rd!`** (all demo accounts use that password — see [backend/README.md](backend/README.md#demo-data)).
Only need the UI? The bundled mock API serves fabricated data: `node scripts/mock-backend.mjs` (from `frontend/`; `:4010`, same logins) then
`API_URL=http://localhost:4010 npm run dev`. Don't run the mock and the real backend on the same port.

## Scripts
| Where | Command | What |
|---|---|---|
| `frontend/` | `npm run lint` · `npm test` | ESLint · frontend unit/component/integrity tests (446) |
| `frontend/` | `npm run build` | production build |
| `frontend/` | `npm run build:e2e` then `npm run e2e` | e2e against the **mock** API (HTTP checks + Playwright) |
| `frontend/` | `npm run e2e:real` | the same suite against **`../backend`** (temporary SQLite, demo data, test controls) |
| `backend/` | `npm run migrate` · `seed` · `db:reset` · `dev` · `test` | schema · demo data · wipe & reseed (dev only) · run · backend tests (499) |
| `backend/` | `npm run cli -- orgs \| show \| approve \| reject \| suspend \| create-platform-admin` | platform operator CLI (approve registered organizations) |

e2e ports: API `4010`, app `3100` — override with `MOCK_PORT` / `E2E_APP_PORT` (the runner refuses to start if a port is busy,
e.g. while your dev backend is on 4010).

## Environment
Frontend (`frontend/.env.local`, see `frontend/.env.example`): `API_URL` (backend base URL, server-side only),`TRUSTED_PROXY_HOPS` (reverse proxies in front of the app — lets the backend rate-limit per visitor; default `1` on Vercel, else `0`),
`NEXT_PUBLIC_SUPPORT_EMAIL` (optional). Backend (`backend/.env`, see `backend/.env.example`): database, secrets, mail, uploads, rate
limits, `ENABLE_TEST_CONTROLS` — full table in [backend/README.md](backend/README.md#environment-variables).

### E-mail (SMTP) settings — backend `.env`
| Variable | Default | |
|---|---|---|
| `SMTP_HOST` | – | setting it enables real delivery automatically (empty = development fallback, see below). **Required in production** |
| `SMTP_PORT` | `587` | `587` STARTTLS · `465` implicit TLS |
| `SMTP_SECURE` | `false` | `true` for port 465 |
| `SMTP_USER` / `SMTP_PASS` | – | credentials (Gmail: an *app password*) |
| `SMTP_FROM` | `MASAR <no-reply@masar.local>` | sender address |

Also: `EMAIL_OTP_TTL_MINUTES` (15) · `EMAIL_OTP_MAX_ATTEMPTS` (5) · `EMAIL_OTP_RESEND_COOLDOWN_SECONDS` (60) · `SIGNING_SECRET` (keys the code hash; ≥ 32 chars in production).

## How e-mail verification works (6-digit code)
1. **Register** (`/register`): the backend e-mails a 6-digit code to the admin's address (Arabic message, valid 15 minutes).
2. **Enter the code** on `/verify-email` → `POST /api/auth/verify-email { email, code }`. The code is stored only as a keyed hash; 5 wrong
   attempts invalidate it.
3. **Didn't get it?** "إعادة إرسال الرمز" → `POST /api/auth/resend-verification { email }` — a new code replaces the old one (60 s cooldown).
4. Once verified you can log in; onboarding and approval follow as before. If you try to log in before verifying, the login screen offers a
   link back to the code screen.

### Other e-mailed codes (same mechanism, same SMTP settings)
* **Employee invitation** — an admin adds an employee → a code is e-mailed (valid `INVITE_TTL_HOURS`, default 48) → the employee opens
  `/set-password`, enters it and chooses a password. Only an admin can re-send it (the employees screen shows "بانتظار التفعيل" + a resend button).
* **Forgot password** — `/login` → "نسيت كلمة المرور؟" → `/forgot-password` (e-mail) → a code is e-mailed to a verified account (the screen
  looks the same for every address) → `/reset-password` (code + new password). A reset ends all sessions of the user and e-mails a
  "password changed" notice. After 10 wrong codes within an hour the address is blocked for the rest of the hour.

**Without an SMTP server (development / demos):** leave `SMTP_HOST` empty — nothing is sent and the backend **prints the code to its console**
(`cd backend && npm run dev`), so you can complete the flow live. This printing is disabled in production, where `SMTP_HOST` is mandatory.

## Documentation (load only what you need)
| File | Read it for |
|---|---|
| [backend/README.md](backend/README.md) | backend setup, environment variables, scripts, demo data & credentials, operator CLI, testing, production notes |
| [docs/api-contracts.md](docs/api-contracts.md) | every endpoint: permission, payloads, responses (real examples), enums, errors, extension endpoints |
| [docs/backend-rules.md](docs/backend-rules.md) | auth model, organization lifecycle, permission catalog, escalation rules, uploads, rate limits, workflows, notifications, open items |
| [docs/architecture.md](docs/architecture.md) | frontend folder map, patterns (BFF, services, QueryState), conventions, commands |
| [docs/state-and-auth.md](docs/state-and-auth.md) | cookies, session, route-guard matrix, client state, error handling |
| [docs/roadmap-and-issues.md](docs/roadmap-and-issues.md) | fixed issues + proof, verification results, remaining work, known limits |
| [docs/user-journeys.md](docs/user-journeys.md) | what each kind of user can do, screen by screen |
| [docs/demo-accounts.md](docs/demo-accounts.md) | demo logins, demo projects, how to get them |
| [docs/MASAR_SRS_v1.5.md](docs/MASAR_SRS_v1.5.md) | the requirements specification of the system as built |

## Project status
Frontend and backend are implemented end-to-end. Last full runs: backend 499 tests (SQLite and PostgreSQL 17), frontend 446 tests
(2026-11-18); the HTTP and browser e2e suites last ran on 2026-11-16 and have not been re-run since projects became mandatory. Lint has 2
known `react-hooks/set-state-in-effect` errors. **Not yet verified:** the e2e suites on PostgreSQL, and CI for the backend (CI runs the
frontend lint and build only). **Open:** real Terms and Privacy text, and a shared store for the in-memory per-identity rate limits before
running several backend instances. The platform operator has a web console at `/operator` (the CLI still works). Details and priorities:
[docs/roadmap-and-issues.md](docs/roadmap-and-issues.md).
