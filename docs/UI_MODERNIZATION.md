# MASAR UI modernization (branch `design/ui-modernization`)

Scope: front-end presentation only. No change to the backend, database, API contracts, routes, auth or permissions,
and no invented data: every figure on screen still comes from the API response it came from before.

## Design language

| Area | Decision |
| --- | --- |
| Colour | Neutral surfaces, teal brand (`--brand-*`, `--fill-*`), semantic status colours (`--ds-success/warning/danger/info/neutral-{bg,fg,line}`). No colour literals in dashboard CSS or inline styles. |
| Shell | Dark-teal full-height rail (`--ds-side-*`, light and dark variants), light header with breadcrumbs, profile, notifications, theme toggle and search. Collapsed rail with tooltips, mobile drawer. |
| Surfaces | Flat cards: 1px `--ds-line` border, `--ds-radius` (12px), no decorative drop shadows, no glass blur, no hover lift. |
| Motion | Short fade-in only; every animation is disabled under `prefers-reduced-motion`. |
| RTL | Logical properties (`inline-start/end`, `padding-inline`, `text-align: start`). Chart x-axis is mirrored explicitly because SVG coordinates are not mirrored by `dir`. Numbers inside RTL text are isolated with `<bdi>`. |
| Dark mode | Tokens only, so every module follows `html[data-app-theme="dark"]`. |

## Shared building blocks (`frontend/src/components/ui`)

- **`PageHeader`**: title (the page's one `h1`), subtitle, meta, badge, optional icon, secondary and primary actions on the inline-end side, optional contextual toolbar. Collapses to one column below 560px. Used by every module page and every MEAL sub-page. Pages that need a different arrangement pass different slots (for example reports puts the project picker and upload next to the primary action; the project detail page puts status, code and dates in `meta`).
- **Tables**: `tableCard` (summary line + `tableWrap` + footer with count and pager), `table` (tinted header row, 12/14px cells, hairline row dividers, hover tint, `start` alignment), `tableLink`, `mono`, `avatarSm`, `inlineCell`. Used by tasks, requests and employees.
- **Badges**: `badge_{success,warning,danger,info,neutral}`. Legacy status/priority tones map through `badgeTone()` in `lib/labels.js`.
- **Forms/controls**: `Field`/`Input`/`Select`/`Textarea` (unchanged API) plus `control` for compact toolbar selects, `searchBox`, `segmented`, `filterBar`, `inlineForm`, and dialog helpers (`bodyText`, `descList`, `plainList`, `listCard`).
- Heading, empty, loading and error states keep using `QueryState`.

## Module notes

- **Employees**: card grid replaced by a dense table (avatar initial, role + origin, department, status badges, invite-pending badge). Row actions keep their accessible names; they are compact ghost icon buttons rather than a kebab menu because the existing workflows and tests address them directly.
- **Tasks / Requests**: same table system; column order now reads naturally right-to-left (number, title, type, person, department, priority, status, date). Requests keep status tabs with counts.
- **Roles**: stays a card-per-role view (each role is a list of granted permissions); flattened.
- **Files, Reports, Notifications, Units, Settings, Account**: shared header; flat cards; segmented filter for notifications.
- **MEAL**: the green gradient banner and per-page gradient headers are replaced by `PageHeader`; KPI cards are compact (icon + value + title + trend) with neutral value colour.
- **Detail pages** (project, task, request): header/badges aligned to the system, attachment icons and activity dots use tokens. Their two-column structure (content + side details) was kept because it already fits their workflow.

## Honest verification status

Run in this environment (no network, no `node_modules`):

- esbuild bundle of every front-end source and test file: 233 files, 0 failures.
- ESLint (`no-undef`, `no-unused-vars`, `no-dupe-keys`, `no-unreachable`) on the changed files: clean.
- Pure tests under a minimal Vitest shim: CSRF (10), client-IP (36), weekly-chart geometry (4), plus a script check of `badgeTone` coverage.
- The real components were bundled with shims for `next/*`, `lucide-react` and React Query and rendered in Chromium (Playwright) with harness-only fixtures shaped like the API, at 1280, 768 and 390 px, light and dark, for 20 pages: no page errors and no horizontal overflow after fixing one (screen-reader text escaping a scroll container).

NOT run here, and must be run before merging: `npm ci`, `npm run lint`, `npm test` (real Vitest with Testing Library, including the new `page-header.test.jsx`), `npm run build`, the Playwright E2E suite, and a visual pass with the real font (IBM Plex Sans Arabic) and real icons (the harness shows placeholder icons and a fallback Arabic font).

Existing component tests were reviewed by hand against the DOM changes (accessible names, heading levels, tab labels and counts, `tbody` buttons, file inputs). The one real coupling found (request tabs must read "count then label") was preserved.

## Known limitations / remaining work

- No sparklines, donut or hero illustration from the reference mock-up: the API has no history series and there is no image asset; none were invented.
- MEAL sub-page tables and side panels were flattened and tokenised but not rebuilt on the shared table primitives.
- Form dialogs use the existing `Modal`/`Form` primitives; deeper form re-organisation (sections, inline help text) is not done.
- Pre-existing CSS class references that were never defined (for example `UnitCard.cardBody`, `MealCharts.quarterTabs`) are unchanged.
