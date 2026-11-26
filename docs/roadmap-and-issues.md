# Roadmap, fixed issues & operational status

_Last verified: 2026-11-18 for lint, the frontend suite and the backend suite; the end-to-end rows were last run on 2026-11-16 (before projects were made mandatory and MEAL was moved into projects) and have not been re-run since — treat their counts as historical._
_Update 2026-11-16: the table below was re-run (counts in the "Result" column are current). Added since: volunteer count removed from the
organization profile (migration `…08`), job-title → role auto-assignment with manual override and an audit log (migration `…09`,
[api-contracts §8b](./api-contracts.md)), and [user-journeys.md](./user-journeys.md) with the UI gaps found._

## 1. Verification results
| Layer | Command | Result |
|---|---|---|
| Lint | `cd frontend && npm run lint` | **2 errors**, both `react-hooks/set-state-in-effect`: `dashboard/layout.js` (sidebar collapse) and `components/ui/ThemeToggle.js`; 0 warnings (`backend/` is a separate package with its own tooling) |
| Production build | `npm run build` / `build:e2e` | passes (last run 2026-11-15); route table shows `ƒ Proxy (Middleware)` (guard active) and the new `/set-password` |
| Frontend unit + component + integrity | `npm test` | **446 / 446** in 29 files (2026-11-18) |
| Backend unit + integration | `cd backend && npm test` | **499 / 499** in 20 files (in-memory SQLite, 2026-11-18); the same 499 pass on PostgreSQL 17 (2026-11-17) |
| HTTP end-to-end vs **backend** (real prod server) | `npm run e2e:real` (part 1) | 143 / 143 on 2026-11-16 (not re-run since) |
| HTTP end-to-end vs the **mock** | `npm run e2e` (part 1) | 139 / 139 on 2026-11-16 (the 4 real-only checks — client address, operator 403 — are skipped; not re-run since) |
| Browser end-to-end vs **backend** (Chromium, Playwright 1.56) | `npm run e2e:real` (part 2) | 40 / 40 on 2026-11-16 (the operator-console journey runs on the mock only; not re-run since) |
| Browser end-to-end vs the mock | `npm run e2e` (part 2) | 41 / 41 on 2026-11-16 (not re-run since) |
| Migrations | `node scripts/db.mjs migrate` → `rollback` → `migrate` (SQLite) | up / down / up all succeed (12 migrations) |
| Mutation check | revert 3 security fixes | tests failed 6 / 5 / 1 → they can fail |

**Hydration error #418 — fixed (issue 21).** `/dashboard` and `/dashboard/meal` are pre-rendered at build time and rendered
`new Date()` into the HTML, so React reported a mismatch on every later day (the two browser tests only passed on the day of the build).
Verified by inspecting the pre-rendered HTML (no date any more) and by `src/components/ui/__tests__/hydration.test.jsx`, which
pre-renders on one day, hydrates on another and fails for the old approach.

**PostgreSQL:** the backend suite (499 tests) passes on PostgreSQL 17 (`TEST_DATABASE_URL=… npm test`); the real e2e against PostgreSQL has not been run.
Run the frontend and backend suites one after the other: started together on a busy machine, some frontend tests time out.
**Not verified:** backend in CI · Firefox/Safari/mobile · Lighthouse.

**How the real-backend e2e differs from the mock run:** the mock fabricates some figures (dashboard `91/79/12`, MEAL `71.4%`,
"نساء — 55%", reports `301`/`+24%`), uses `R-n` request ids, accepts any file as a PDF and any verification signature. The real API
computes everything from data, so those tests read their expected values from the API when `E2E_BACKEND=real`, and the journey test
reads the 6-digit verification code from the backend's outbox (`GET /__control/mail`) — the one place a test can see the e-mail, exactly
as a user reads it from their inbox. The mock accepts a fixed code (`123456`) but mimics the rules (5 attempts, then `429`).

## 2. Issues fixed
| # | Issue | Fix | Proof |
|---|---|---|---|
| 1 | Login was a `setTimeout` mock with pre-filled credentials | real `POST /api/auth/login`; empty form; errors in banner | LoginForm tests (8), e2e |
| 2 | Plaintext password in `sessionStorage` | password fields stripped; integrity scan forbids it | RegisterForm test, scan, e2e |
| 3 | Token key mismatch / token in localStorage | single `auth_token` **HttpOnly** cookie, set only by the BFF | route tests, e2e (cookie flags, not readable by JS) |
| 4 | Route guard inactive (root `middleware.js`) | `src/proxy.js` + `lib/access.js`; unauthenticated requests redirected | 8 proxy tests, 18 route checks in prod, build output |
| 5 | Onboarding masked every failure as success | throws `ApiError`; field errors mapped; no local queue | OrganizationForm tests (7), e2e (500 shown, no success) |
| 6 | Locked org fields empty when logging in from another browser | prefilled from session organization | test + e2e journey |
| 7 | TopHeader crash (`markAsRead`, `notif.read`) | notifications via React Query, optimistic read | shell tests, e2e |
| 8 | Duplicate sidebar on `/dashboard/units` | removed | unit + e2e (`aside` count = 1) |
| 9 | `?link=` fetched any URL | _(superseded)_ the whole link mechanism was replaced by a 6-digit code: no URL is fetched any more, the `link` parameter is ignored | verify-email tests, e2e ("hostile `?link=` is ignored") |
| 10 | Verify step self-verified using the link returned at registration (bypassed e-mail ownership proof) | _(superseded)_ the code is only e-mailed — never returned by the API, never stored in the browser | verify-email "SECURITY" test, e2e (response never contains the code) |
| 11 | Status check re-sent e-mails / matched message text | _(superseded)_ no status endpoint: the user types the code and `POST /auth/verify-email` answers | tests |
| 12 | Hard-coded third-party chat URL | _(superseded)_ the AI assistant (`/api/chat`, `CHAT_API_URL`, `/__chat`) was **removed from the product** on 2026-11-16; it will be rebuilt later | its tests were removed; a sidebar test asserts it is gone |
| 13 | `FIELD_MAP` region/phone mismatch | corrected | RegisterForm 422 test |
| 14 | **All dashboard mock data** (≈60 components) | replaced by services + TanStack Query with loading/error/empty states | integrity scan (72 checks), module tests, e2e |
| 15 | Static buttons/forms | wired: create/edit/delete, approve/reject, comments, uploads, filters, pagination, exports, imports, toggles | module tests, 30 browser tests |
| 16 | Detail pages did not refresh after updates (numeric vs string id in query key) | prefix invalidation | regression test, e2e |
| 17 | Roles showed raw permission keys | labels resolved from `/permissions` | regression test, e2e |
| 18 | Mount effect overwrote typed values in onboarding form | merge instead of replace | test |
| 19 | Dead code, duplicate `/under-review`, `vercel.json` rewrites, `console.log`, `alert()` | removed / redirected | integrity scan |
| 20 | Missing `/terms`, `/privacy` | placeholder pages (**legal text still needed**) | build routes |
| 21 | React hydration error #418 on `/dashboard`, `/dashboard/meal` (build-time date) and `/register` (draft read from `sessionStorage` during the first render) | `<TodayDate>` renders the date after hydration; the register draft is restored in an effect | hydration tests (control case proves the harness detects the old bug), pre-rendered HTML, e2e |
| 22 | `npm test` exited 1 at random (unhandled `window is not defined` from a toast timer firing after teardown) | `ToastProvider` tracks and clears its timers | ToastProvider tests (no timer left after unmount), 4 consecutive green runs |
| 23 | No error screens: a render crash showed Next's default page, unknown URLs the English 404 | `error.js`, `global-error.js`, `not-found.js`, `dashboard/error.js` (the shell stays usable) with a shared Arabic `ErrorScreen` | error-page tests |
| 24 | Employees created in the UI could never sign in (`can_login: false`, no way to set a password) | **Invitation flow:** e-mailed 6-digit code (`INVITE_TTL_HOURS`) → `/set-password` → `POST /auth/set-password`; pending badge + admin "resend" (`POST /employees/{id}/invite`); security rules in `backend-rules.md` §1 | 33 backend tests (incl. takeover / enumeration / lockout), 13 + 8 frontend tests, e2e HTTP section G + browser journey |
| 25 | Every visitor shared one set of per-IP rate limits (the backend only ever saw the Next.js server's address: e.g. 10 registrations / 10 min and 30 logins / 5 min for the whole site) | The BFF forwards the visitor's address as `X-Forwarded-For` (only what its trusted proxy appended — `TRUSTED_PROXY_HOPS`; never the raw header; not to the AI assistant); the backend believes it only from `TRUST_PROXY` (now an address / CIDR / `loopback` list, validated at start-up; `true` still works but is documented as forgeable); production warns when it is unset | 31 backend tests (per-visitor buckets, forged prefixes, untrusted peers), 36 + 7 frontend tests, e2e section I against the real backend |
| 26 | A platform operator who logged in landed on a dashboard where every call was `403` | `is_platform_admin` in `/login` and `/auth/me`; the BFF sets status `operator`; the route guard sends operators to the new `/operator` page (CLI instructions + logout) and keeps them out of `/dashboard` and `/onboarding` (and organization users out of `/operator`); the dashboard layout redirects a session that predates the change | access, proxy, session, route and page tests, e2e section H + browser journey |
| 27 | No way to recover a forgotten password (the login screen said "contact your organization admin") | **Forgot-password flow:** `/forgot-password` → e-mailed 6-digit code → `/reset-password` (`POST /auth/forgot-password`, `POST /auth/reset-password`); the answer is identical for every address; a reset ends **every session** of the user, lifts the login lockout and e-mails a "password changed" notice; the three code kinds (invitation / verification / reset) cannot be redeemed as one another; **hourly cap of 10 wrong guesses per address** across all codes. Also closed two account-enumeration oracles in the existing verification flow (differing `429` texts; "still locked after a re-send" for unknown addresses only) | 42 backend tests (mutation-checked: revocation, purpose guards, cap, fresh-attempts), 44 frontend tests, e2e section J + 3 browser journeys |
| 28 | The onboarding profile still recorded a volunteers count (volunteer management is out of the project's scope) | column dropped (migration `…08`, reversible); the API no longer stores or returns it but still accepts it from older clients; tests updated (+1 new) | onboarding + platform tests, migration round-trip, e2e:real |
| 29 | Roles had to be picked by hand for every employee | **Job title → category → default role → permissions**, deterministic and tested (38 tests); manual override is final, marked `manual` and audit-logged; no escalation, never an admin role; `GET /job-categories`, `GET /employees/{id}/audit` | `backend/test/job-roles.test.js` |
| 31 | Everyone saw every link and button, whatever their job | **Four fixed job categories**, each with a view/edit permission package; `usePermissions` hides what a person cannot use (backend still enforces) | job-roles tests (38), shell tests, `usePermissions` tests |
| 32 | No project concept: requests/tasks/beneficiaries/files were organization-wide | **Projects** (migration `…10`): team of employees + supervisors, project-scoped requests, tasks, beneficiaries registry (with files/images), folders, files and reports; supervisors approve a project's requests; non-members get 404 | `projects.test.js` (12), `projects-scope.test.js` (15), `projects.test.jsx` (9) |
| 33 | A request could be approved by its own author, and work could exist outside any project | **Separation of duties:** `approve`/`reject` of your own request → `403` (the UI hides the buttons and says why). **Mandatory project:** `project_id` is required on requests, tasks, folders and reports and every file goes into a folder (migration `…11`: deletes rows without a project, `NOT NULL` + `ON DELETE CASCADE`; the default folders of a new organization are gone); forms ask for the project, the assignee list is the project's team | backend 498 tests (projects-scope, requests, tasks, files-reports, migration round-trip), frontend 446 tests, e2e mock + real |
| 34 | MEAL data (indicators, complaints, field records, MEAL reports) referred to a project by free text | `project_id` NOT NULL on the four tables (migration `…12`: names became real projects, text column dropped); everything MEAL is scoped to the caller's projects; forms pick a project, indicator picker follows it; found and fixed on PostgreSQL: `/meal/activity` ordering and `wipeData` deleting the built-in report templates | backend 499 tests on SQLite **and** PostgreSQL, frontend 446, e2e |
| 30 | Operator review dialog had two buttons named «إغلاق» (header ×, footer) | the × is now «إغلاق النافذة» | operator e2e |

## 3. Remaining work (priority order)
_Done since the previous revision: the backend (`backend/`, all endpoints in `api-contracts.md`, auth/permissions/tenant isolation/rate
limits enforced server-side), the platform-operator CLI, demo data, and the e2e suite against it._

**Blockers before launch**
1. ~~Employee invitation / set-password flow~~ — **done** (issue 24). ~~Forgot-password flow~~ — **done** (issue 27).
2. **Run the backend on PostgreSQL** (`DATABASE_URL`) — run `cd backend && npm test` and `npm run e2e:real` against it — and decide hosting.
   Uploads are on local disk (`UPLOAD_DIR`): mount persistent storage or add a storage driver.
3. **Production configuration:** backend `NODE_ENV=production`, `SIGNING_SECRET` (≥ 32 chars), `DATABASE_URL`, SMTP (`MAIL_TRANSPORT=smtp`),
   `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` (the verification code is only delivered by e-mail — verify the
   credentials with a real registration), **`TRUST_PROXY`** (the Next.js server's address / range — a list, not `true`; see
   `backend/README.md` "Real client addresses"), HTTPS; frontend env in Vercel (`API_URL`, `TRUSTED_PROXY_HOPS`
   (1 on Vercel, automatic), optional `NEXT_PUBLIC_SUPPORT_EMAIL`). Create the first platform operator with `npm run cli -- create-platform-admin`.
4. ~~Fix the hydration error #418~~ — **done** (issue 21). Error boundaries / 404 — **done** (issue 23).
5. ~~UI for organizations that are `rejected` / `suspended`~~ — **done**: the login `403` now carries `organization_status` + `reason` (only after the password was right) and the login screen explains it with a support link.
6. Provide the real **Terms** and **Privacy** text.

**Follow-ups from [user-journeys.md](./user-journeys.md)**: all of G1–G6 are done (permission-aware UI, list settings, folders/reports on the
general pages, job category field + role history, blocked-organization message). G7 (separation of duties) and G9 (mandatory project) are done too — issue 33.
Done: the AI assistant was removed (issue 12), volunteers removed everywhere (issue 28), permission-aware UI (31), projects (32).

**Should do**
7. CI: run `npm test` (in `frontend/`), `cd backend && npm test` (Node 22+) and the e2e jobs in `.github/workflows/*.yml` (they currently run lint + build of `frontend/` on Node 20). **Vercel:** set the project's *Root Directory* to `frontend` (the staging workflow runs the Vercel CLI from the repo root).
8. Token refresh / "log out everywhere"; shared store for the per-identity rate limits when running several backend instances.
9. Security headers (CSP, frame-ancestors, referrer-policy) in `next.config.mjs`.
10. ~~Decide on separation of duties for request approval~~ — **done** (issue 33): nobody decides a request they submitted.
11. MEAL report as a real **PDF** (today an HTML document). ~~Delete endpoints for files/reports/attachments/folders~~ — **done** on the `design/ui-completion` branch (`DELETE /files/{id}`, `/files/folders/{id}`, `/reports/{id}`, `/requests|tasks/{id}/attachments/{aid}`; confirmation dialog in the UI; audited) — pending the CI run.
12. Accessibility audit (labels are fixed on new forms; landing page and some icon buttons not audited); keyboard/focus handling in modals.
13. Cross-browser (Firefox/Safari) and mobile QA; performance budget (Lighthouse) — not measured.
14. ~~Remove unused dependency `react-icons`~~ — done on `design/ui-completion`; consider TypeScript + zod schemas mirroring the API.

**Nice to have**
15. i18n layer, server components for read-only pages, Sentry, Dependabot, Husky/lint-staged; database backups/retention policy.

## 4. Known limitations / decisions
* The legacy mock API (`scripts/mock-backend.mjs`) is kept only for UI-only demos and the default `npm run e2e`; it fabricates some
  figures and is more permissive than the backend (see §1). The real backend is the reference for behavior.
* The built-in unit catalog has three units; only MEAL has screens (field operations is toggleable but empty, HR is "in development").
* Removed UI with no defined backend meaning: "إعدادات التصنيف" (complaint categories) button.
* Side-panel buttons ("عرض التحليل", "مراجعة المطلوب" …) apply a list filter rather than opening new screens.
* The status cookie is a UX hint; a forged cookie without a token grants nothing (tested).
* Node 24 + Playwright < 1.56 hangs on this machine; use ≥ 1.56.
* If your `npm run dev` was running while files were rebuilt, restart it and add `.env.local`.
