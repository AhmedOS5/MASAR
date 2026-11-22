# MASAR 2027 — Audit and adapted plan

> **Historical record.** The visual direction described in §4–§5 was rejected (see §8). Only the items §8 lists under "Kept" are part of the product;
> for the current structure read [architecture.md](./architecture.md) and [MASAR_SRS_v1.5.md](./MASAR_SRS_v1.5.md).

Scope: the **MASAR 2027 master prompt** (Modern Minimal + Premium Enterprise redesign) applied to the repository as it
actually is. Sources: `docs/*`, `frontend/src/**`, `backend/**` and the shipped test suites. Findings marked **[confirmed]**
were read in the repo; **[rec]** is a recommendation; **[not verified]** could not be checked (no test run, no visual
inspection of the running app was possible when this was written).

## 1. Where the master prompt and the repository differ

| Master prompt says | Repository reality | Decision |
|---|---|---|
| React + Next.js, Fastify, SQLite | **[confirmed]** Next.js 16 (App Router), React 19, Fastify 5 + Knex + Zod, SQLite (dev/tests) and PostgreSQL (prod, untested) | as described |
| "Tailwind configuration, if present" | **[confirmed]** no Tailwind. Styling = **CSS Modules** + CSS custom properties | keep CSS Modules; tokens live in `globals.css` |
| "Strong TypeScript types if TS is used" | **[confirmed]** plain JavaScript | stay in JS |
| "More than 400 frontend tests" | **[confirmed]** documented as 397 unit + 39 Playwright e2e (+ backend suite) | all must stay green; counts only grow |
| Drawer for Add Employee | **[confirmed]** every form is a centred `Modal` (`features/*`). e2e finds them with `getByRole("dialog")` | build a `Drawer` that keeps `role="dialog"` and the same accessible names, then move forms one by one |
| KPI: Suspended employees | **[confirmed]** employee `status` is only `active \| inactive`; `invite_pending` = no password yet | map: Total, Active, Inactive, **Pending activation (`invite_pending`)**. No "suspended" (organizations, not employees, can be suspended) |
| Employee Number, Job Title, Created date columns | **[confirmed]** model: `name, email, phone, role{id,title}, department, status, can_login, invite_pending, created_at`. No employee number | do not add fields without a backend change; "Job Title" = `role.title` |
| Charts: growth over time, distribution by department, requests by status | **[confirmed]** `/dashboard/summary` returns 4 KPIs + `weekly_activity` (requests/tasks per day) + lists. `/requests` returns `meta.status_counts`. `/employees` lists everyone, so department/status counts can be computed client-side | build only those; "employee growth over time" needs a new API (see §6) |
| Audit logs, platform health | platform health exists (`GET /platform/stats`); **no audit-log API** | document as missing API (§6) |
| Mobile app, volunteers, AI tools | out of the graduation-project scope | not part of this redesign; remove leftovers in the scope phase |
| Fonts IBM Plex Sans Arabic + Inter | was Cairo via `next/font/google` | switched (see §4) |
| Palette #123D35 / #1D7463 / #F5F7F6 / #25332F / #E7A94B and a dark palette | previously #0F5132 / #0D9488 / #F8FAFC | **replaced by the approved 2027 palette** (§4) |

## 2. Existing architecture [confirmed]

- **Frontend** `frontend/src`: `app/` (routes), `components/ui` (Modal, ConfirmDialog, Form, QueryState, Pagination, RowMenu),
  `features/{people,requests,tasks,meal}` (form modals + mutation hooks), `services/*` (the only place that calls the API through
  `lib/http.js`), `hooks` (`useSession`, `useLogout`, `useDashboardSummary`…), `lib` (format, labels, session, access).
- **BFF**: `app/api/**` forwards to the backend; the session token is an HttpOnly cookie, never in JS. `proxy.js` is the route guard.
- **Routes**: `/dashboard` (+ `employees`, `roles`, `requests`, `requests/[id]`, `tasks`, `tasks/[id]`, `units`, `meal/*`
  (complaints, field-data, indicators, reports), `files`, `reports`, `notifications`), `/operator`, `/onboarding/*`, public landing, auth pages.
- **Backend**: RBAC by permission keys; tenant isolation enforced per query by `organization_id`; email OTP (hashed code, never returned);
  organization lifecycle `incomplete → pending_approval → approved` (+ `rejected`, `suspended`).
- **Tests**: Vitest + Testing Library (`__tests__` beside the code, `no-mock-data.test.js` as a source-integrity gate) and Playwright against a
  mock API (`scripts/mock-backend.mjs`) or the real backend (`npm run e2e:real`).

## 3. Findings

**Confirmed**
1. Colours were hard-coded hex in ~30 CSS modules; there was no dark theme in the workspace (the landing page has its own `data-theme`).
2. Shell: fixed 70 px header, 280 px sidebar on the right (RTL correct), mobile drawer. Not collapsible, no breadcrumbs, no theme switch,
   global search only reaches the requests list.
3. Sidebar contains three "قريباً" (coming soon) disabled entries — dead navigation the prompt forbids; kept for now because the product
   marks them intentionally as upcoming units.
4. Dashboard = welcome banner (hard-coded emoji), 4 API KPIs with a counter animation, weekly activity, action panels. No employee-status KPIs, no pending-actions strip.
5. Forms are modals; the Modal now has sticky header/footer and a 75vh scrolling body.
6. Tables lack a shared component: each module hand-rolls its table, filters and empty state (partly unified through `ui.module.css`).
7. Accessibility: Modal has `role="dialog"`/`aria-modal`/Escape but **no focus trap or focus return**; toasts use `role="status"`.
8. `useDashboardSummary`, `QueryState` etc. already give consistent loading/error states.

**Recommendations [rec]**
- Add focus trap + focus restore to `Modal` (and the future `Drawer`).
- Extract one `DataTable` + `FilterBar` and migrate list pages gradually (tests drive the order).
- Replace the welcome emoji and counter animation with the calmer MASAR 2027 header; respect `prefers-reduced-motion`.

## 4. Foundation delivered in this iteration

- **Tokens** (`app/globals.css`): Deep Forest `#123D35`, Emerald `#1D7463`, Soft Canvas `#F5F7F6`, Graphite `#25332F`, Warm Amber `#E7A94B`
  (`--ds-accent`), semantic success/warning/danger/info/neutral sets.
- **Dark theme** — `html[data-app-theme="dark"]` with the approved palette (`#101C19` app, `#1B2A25` cards, `#304139` borders,
  `#F0F5F2`/`#A8B9B1` text, `#49A58D` accent). Status colours become translucent tints. Scoped to `/dashboard` and `/operator`;
  the landing page is untouched.
- **Theme switch**: `lib/theme.js` + `components/ui/ThemeToggle.js` (light / dark / system), stored in `localStorage["masar-theme"]`, applied by an
  inline boot script in `<head>` before first paint (no wrong-theme flash). Mounted in the workspace header and the operator top bar.
- **Fonts**: IBM Plex Sans Arabic (Arabic) + Inter (Latin/digits) through `next/font/google`; `tabular-nums` on tables.
- **Tooling**: `scripts/tokenize-css.mjs` (pass 1) and `scripts/tokenize-css-dark.mjs` (pass 2: white surfaces → `--ds-card`, white-on-colour → `--ds-on-brand`,
  pale status tints → status tokens). Both idempotent, both support `--dry`.
- **Tests**: `components/ui/__tests__/theme.test.jsx` (default, persist, restore, corrupt value, system, cleanup).

## 5. Plan (phases, each ends with the full suites green)

1. Audit — this document.
2. Foundation — above. **Run** `node scripts/tokenize-css-dark.mjs --dry`, then without `--dry`, then `npm test` and `npm run e2e`.
3. Shell — collapsible sidebar (persisted, tooltips when collapsed), breadcrumbs, header polish. Breadcrumb text duplicates sidebar labels, so
   first make sure no test/e2e locator relies on a unique `getByText` for those labels.
4. Dashboard — keep the 4 API KPIs, add employee KPIs (total / active / inactive / pending activation) from `/employees`, requests by status from
   `meta.status_counts`, department distribution from `/employees`, pending-actions strip, quick actions filtered by permission.
5. Employees — table with search/status/department filters, then Add/Edit in a right-hand `Drawer` (same `dialog` role and labels).
6. Other modules (units, requests, tasks, files, reports, settings) onto shared `DataTable`/`FilterBar`/`EmptyState`.
7. Super-admin console — built in the previous iteration; add dark-mode QA and an audit-log view once the API exists.
8. Final QA — responsive (375/390/768/1280/1440), RTL, both themes, accessibility, bundle check.

## 6. Missing backend capabilities (documented, not faked)

- Employee growth over time (needs `created_at` aggregation, e.g. `GET /dashboard/summary?include=employee_growth` or a stats endpoint).
- Audit log for sensitive administrative actions. Since this was written the backend records **role assignments and changes** (`audit_logs`,
  `GET /employees/{id}/audit`); approve/reject/suspend decisions are not in it.
- Settings: organization profile update, user profile/password change and notification preferences endpoints (verify before building those screens).

## 7. Risks

- **Dark mode not visually verified.** Contrast and leftover light islands can only be confirmed by looking at every page in both themes.
- Colour conversion touches ~30 CSS files automatically; review `git diff` before committing.
- `next/font/google` needs network access at build time (same as the previous Cairo font).
- Concurrent edits: another session may be changing the same files; always re-read before overwriting.

## 8. Outcome (final): the 2027 visual direction was rejected

After seeing previews of the flat "Modern Minimal" look, the product owner rejected it and asked for the previous look back.
What the repository contains now:

**Look = as before the 2027 work.** Emerald/teal palette on slate surfaces (`#0F5132` / `#0D9488` / `#F8FAFC`), blue→green header gradient, gradient welcome banner, glass cards, centred modals. The 2027 palette, IBM Plex/Inter, the flat
header/banner/cards and the employee form drawer were **reverted**. Sections 4 and 5 above describe the abandoned direction and
are kept only as a record.

**Kept (functional additions, styled in the existing look)**
- Dark theme for `/dashboard` and `/operator` with the light / dark / system switch (`lib/theme.js`, `ThemeToggle`). Light is the default.
- `--fill-*` tokens and `scripts/tokenize-css-dark.mjs`: every rule leaves the light theme pixel-identical and only lets dark mode re-colour surfaces.
- Collapsible sidebar (icon rail with tooltips, remembered), breadcrumbs in the header.
- Employees: figures that double as status filters, search, filtered empty state.
- `prefers-reduced-motion` honoured globally.
- Font: **IBM Plex Sans Arabic** is the product's typeface today (`app/layout.js`, one `next/font/google` call), replacing Cairo.
- The platform operator console (`/operator`) from the previous iteration.

**Cancelled** (different system, or too much work for its value): Tailwind, TypeScript, new folder structure, employee number /
"suspended" status, data-table rewrite with bulk actions and export, charts that need new APIs, audit-log screens, Kanban, file
preview, settings pages, command palette, organization selector, English/LTR.

**Known limits**: dark mode was checked only on a static mock of the header, sidebar, dashboard header and employees page; other
pages may still show light islands (pale status tints are intentionally left as they are). No automated test was run when this was written.
