# Architecture

> Load this file when you need to know **where things live and how the frontend is built**. For endpoints see
> [api-contracts.md](./api-contracts.md); for what the backend enforces see [backend-rules.md](./backend-rules.md); for
> auth/cookies/state see [state-and-auth.md](./state-and-auth.md); for the backend itself see [../backend/README.md](../backend/README.md).

## Stack
Frontend: Next.js 16 (App Router, Turbopack) · React 19 · JavaScript (JSX in `.js`) · CSS Modules + CSS variables ·
TanStack Query 5 · Framer Motion (page transition) · lucide-react · Vitest + Testing Library · Playwright.
Arabic / RTL (`<html lang="ar" dir="rtl">`), IBM Plex Sans Arabic via `next/font/google` (`app/layout.js`).
Backend (`backend/`): Node 22+ · Fastify 5 · Knex (SQLite dev/tests, PostgreSQL prod) · Zod · Vitest.

## Request path (the one idea to remember)
```
Browser ──fetch /api/*──▶ Next.js route handlers (BFF) ──Bearer──▶ backend/ (Fastify, :4010)
        ◀── JSON ────────  (token lives in an HttpOnly cookie, never in JS)
```
* The browser **only ever talks to its own origin** (`/api/...`). No CORS, no backend URL in client code.
* `src/app/api/**` adds the `Authorization: Bearer <cookie>` header and streams the response back.
* `src/proxy.js` (Next 16 "proxy", formerly middleware) guards `/dashboard/**` and `/onboarding/**`.
* The backend issues the opaque token at `POST /login`, never sets cookies, and enforces authentication, permissions and tenant
  isolation itself — the proxy guard is UX only.

## Folder map
The repository root holds two independent packages — `frontend/` (this app) and `backend/` (the API) — plus `docs/` and `.github/`.
Every path below that is not prefixed with `backend/` or `docs/` is relative to **`frontend/`**.
```
src/
├── proxy.js                      # route guard (matcher: /dashboard/:path*, /onboarding/:path*, /operator/:path*)
├── lib/
│   ├── http.js                   # ★ the ONLY browser HTTP client (ApiError, query building, 401 handling)
│   ├── session.js                # cookie names, onboarding-status normalisation, safeNextPath, cookie options
│   ├── access.js                 # pure route-guard decision (unit-tested; used by proxy.js)
│   ├── format.js                 # dates (Latin digits), money, timeAgo, avatars, toPercent …
│   ├── labels.js                 # Arabic labels for backend enum CODES, level colours, palettes
│   ├── icons.js                  # <UnitIcon name="…"/> (backend sends an icon key)
│   ├── otp.js                    # 6-digit code input helpers (verify-email, set-password, reset-password)
│   ├── theme.js                  # light / dark / system theme (localStorage "masar-theme", boot script)
│   └── server/                   # server-only: config.js (API_URL)
├── services/                     # one module per resource; thin wrappers over lib/http.js
│   ├── auth.service.js  onboarding.service.js  requests.service.js  tasks.service.js
│   ├── people.service.js  workspace.service.js  meal.service.js  projects.service.js  platform.service.js
├── hooks/                        # useSession, usePermissions, useOptions, useDashboardSummary, useLogout, useDebounce
├── components/
│   ├── ui/                       # QueryState (loading/error/empty), Modal, Form, RowMenu, Pagination,
│   │                             #   ConfirmDialog, AnimatedNumber, ErrorScreen, ThemeToggle, TodayDate, ui.module.css
│   ├── auth/                     # shared pieces of the public auth screens
│   └── Toast/                    # ToastProvider + toastBus (global mutation-error toasts)
├── features/                     # cross-page feature code: requests/, tasks/, people/, projects/, meal/
│                                 #   (modals + mutation hooks + useFieldRecordForm)
├── test/                         # setup.js, helpers.js (mockFetch), render.jsx
├── __tests__/                    # proxy.test.js, no-mock-data.test.js (integrity scan)
└── app/
    ├── layout.js  providers.js  template.js  globals.css
    ├── error.js  global-error.js  not-found.js   # error boundaries / 404 (shared look: components/ui/ErrorScreen); dashboard/error.js keeps the shell
    ├── page.js + _components/    # landing page (marketing; no backend)
    ├── login/ register/ verify-email/ set-password/ forgot-password/ reset-password/ activation-success/ terms/ privacy/
    ├── operator/                 # the platform operator console (review / approve / reject / suspend organizations); guarded like /dashboard
    ├── onboarding/ (+ waiting-approval/)
    ├── api/                      # BFF route handlers
    │   ├── [...path]/route.js    #   generic authenticated proxy → backend (API_URL)
    │   └── auth/{login,logout,session}/route.js   # (register / verify-email / resend-verification go through [...path])
    └── dashboard/                # layout (TopHeader+Sidebar+NotificationsProvider) + pages
        ├── projects/ (+[id]) requests/ (+[id]) tasks/ (+[id]) employees/ roles/ files/ reports/ notifications/ units/ settings/
        └── meal/ { page, indicators/, field-data/, complaints/, reports/ }   # each with _components/
scripts/   mock-backend.mjs (fabricated-data API for UI-only demos) · e2e.mjs (orchestrator; --real = against ../backend) · build-e2e.mjs · tokenize-css.mjs / tokenize-css-dark.mjs (CSS colour tokens for the dark theme)
e2e/       ui.spec.mjs (Playwright)         (frontend/ also holds: public/, package.json, next/eslint/vitest/playwright configs, .env.example)

../backend/   the REST API (migrations, seeds, src/modules/*, CLI, tests) — see backend/README.md for its own layout
../docs/      this documentation
```

## Conventions
* **Data fetching:** `useQuery({ queryKey, queryFn: service.fn })`; render with `<QueryState query={q}>`
  (skeleton → error banner with retry → empty state → children). Never `fetch()` directly (a test enforces this).
* **Mutations:** `useMutation`; a failed mutation raises an error **toast automatically** (global `MutationCache`).
  Pass `meta: { silent: true }` when the form shows the error inline (and still toast manually if desired).
* **Query keys** (invalidate by prefix): `["session"] ["options"] ["notifications"] ["dashboard","summary"]
  ["requests",params] ["request",id] ["tasks",params] ["task",id] ["employees"] ["roles"] ["permissions"]
  ["units"] ["files",…] ["reports",…] ["projects",…] ["meal",…]`.
* **Permissions in the UI:** `usePermissions()` (from the session's `permissions[]`) hides links, buttons and forms the person's package
  does not allow; the backend enforces the same rules (`403` / `404`), so hiding is convenience only.
* **Server state vs UI state:** filters/pagination/dialog state are component state; lists are fetched
  server-side filtered (`status`, `priority`, `search`, `page`, `per_page` …) — the UI never filters mock arrays.
* **Backend enums are codes** (`pending`, `in_progress`, `sensitive` …). Arabic wording lives in `lib/labels.js`.
* **Select options** (departments, projects, regions …) come from `GET /options` via `useOptions()`.
* **Styling:** one `*.module.css` per component; status/priority tones map to `status_<tone>` / `prio_<tone>` classes.
* **Next.js file rules:** page/route files export only framework names; helpers go to separate modules.
* **Import alias:** `@/` → `src/`.

## Commands
Run these inside `frontend/` (the backend has its own `package.json` in `backend/`).

| Command | What it does |
|---|---|
| `npm run dev` | dev server (needs `API_URL`; copy `.env.example` → `.env.local`; backend: `cd ../backend && npm run dev` on :4010) |
| `npm run lint` | ESLint (currently 2 `react-hooks/set-state-in-effect` errors: `dashboard/layout.js` sidebar collapse and `components/ui/ThemeToggle.js`) |
| `npm test` | Vitest — unit + component + integrity tests (446 in 29 files, 2026-11-18) |
| `npm run build` | production build |
| `npm run build:e2e && npm run e2e` | build to `.next-e2e`, start the **mock** backend + prod server, run HTTP checks + Playwright |
| `npm run e2e:real` | same suite against **`../backend`** (temporary SQLite in `frontend/.e2e-data/`, demo data, `ENABLE_TEST_CONTROLS`) |
| `node scripts/mock-backend.mjs` | run the mock API on :4010 for UI-only demos (`API_URL=http://localhost:4010`); same logins as the backend's demo data |
| `cd ../backend && npm test` | backend tests (499 in 20 files, 2026-11-18) — see `backend/README.md` for migrate/seed/CLI |
