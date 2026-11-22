# Backend rules: security, permissions, lifecycle & workflows

> What the backend (`backend/`, Node 22 · Fastify · Knex) **enforces**, independent of the UI. Endpoint payloads are in
> [api-contracts.md](./api-contracts.md); setup and operations are in [../backend/README.md](../backend/README.md).
> Every statement here is covered by the backend test suite (`cd backend && npm test`, 499 tests in 20 files, re-run 2026-11-18).

## 1. Authentication model
* The browser never talks to this API. The Next.js BFF (`src/app/api/**`) keeps the token in the **HttpOnly** cookie
  `auth_token` and forwards it as `Authorization: Bearer <token>`. **The backend sets no cookies, has no CORS surface and
  needs no CSRF protection.**
* `POST /login` returns an opaque token (`mt_` + 256 bits). Only its **SHA-256** is stored (`auth_tokens`). Default lifetime
  30 days (`TOKEN_TTL_DAYS`); `POST /logout` deletes just the presented token.
* Sessions end immediately (next request → `401`) when the user is deactivated or deleted, the e-mail address is changed, **the
  password is reset**, or the organization is `rejected` / `suspended`.
* Passwords: scrypt (`N = 2^15` by default, `SCRYPT_LOG_N`), 8–128 characters, at least one digit and one symbol — the same
  rule the register form shows. Wrong e-mail and wrong password give the same `401` and take the same time. A password is chosen
  with an e-mailed code in three ways: at registration, by an invited employee (`/auth/set-password`) and by anyone who forgot theirs
  (`/auth/reset-password`, below).
* Login reveals account state (`403`: e-mail not verified / user inactive / organization suspended or rejected) **only after the
  password is proven**. Registration, `POST /auth/verify-email` and `POST /auth/resend-verification` never reveal whether an unknown
  e-mail exists (unknown and already-verified addresses answer exactly like a wrong code: five `422`, then `429`).
* **E-mail verification is a 6-digit one-time code (OTP)** — there is no verification link any more:
  * generated with the OS CSPRNG (`crypto.randomInt`, zero-padded) at registration, on `POST /auth/resend-verification` and when an
    employee's e-mail is changed; sent by e-mail (Arabic, valid 15 minutes — `EMAIL_OTP_TTL_MINUTES`);
  * stored **only as a keyed hash** — `HMAC-SHA256(SIGNING_SECRET, userId . code)` — plus its expiry, attempt counter and send time
    (columns on `users`). A plain SHA-256 of a 6-digit number could be brute-forced offline from a leaked table in milliseconds; the
    server secret prevents that. Compared in constant time. The code is never returned by the API, never logged in production;
  * **one active code per user**: issuing a new one overwrites (= invalidates) the previous code and resets the attempts;
  * **at most 5 wrong attempts per code** (`EMAIL_OTP_MAX_ATTEMPTS`): the counter is incremented atomically in the database *before* the
    comparison, so parallel guesses cannot exceed it. The fifth wrong (or an expired) attempt invalidates the code; further attempts get
    `429 تجاوزت عدد المحاولات…` until a new code is requested. A correct code verifies the address and clears the code (single use);
  * **resend**: 60 s cooldown per address (`EMAIL_OTP_RESEND_COOLDOWN_SECONDS`, counted from the previous code, also applied to unknown
    addresses so it reveals nothing) and 3 codes / 10 min / address;
  * development/demo fallback: without `SMTP_HOST` nothing is sent and — whenever `NODE_ENV` is not `production` — the code is printed to
    the server console. Production refuses to start without `SMTP_HOST`.
* **Employee invitation** reuses the same machinery (same hash, same 5-attempt rule, same columns) for a different purpose:
  * an admin adds an employee (`POST /employees`, status `active`) → an **invitation code** is e-mailed, valid `INVITE_TTL_HOURS`
    (default 48 — the invitee may not read the mail at once). The mail links to `FRONTEND_ORIGIN/set-password?email=…`; the link carries
    **no secret**, the code is typed by hand;
  * `POST /auth/set-password { email, code, password, password_confirmation }` proves the invitation **and** sets the first password and
    verifies the e-mail in one step (no half-activated state). The password policy is checked *before* an attempt is spent, and the
    password is hashed only after the code is right (wrong guesses cost no CPU);
  * **only accounts without a password are eligible** (a second guard, `UPDATE … WHERE password_hash IS NULL`, backs the check up), so a
    registration/verification code can never be turned into a password reset and no account can be taken over. Ineligible and unknown
    addresses are throttled in memory exactly like wrong codes — the outside world sees five `422`, then `429`, for every address;
  * `POST /auth/verify-email` refuses invited (password-less) accounts without touching their invitation, and the **public**
    `POST /auth/resend-verification` mails nothing for them: a public resend would let anyone who knows an address keep issuing fresh
    codes (each resets the attempts) and brute-force the invitation. Only an admin re-issues it (`POST /employees/{id}/invite`, max 5 / employee / 10 min);
  * five wrong guesses kill the invitation (`429` until the admin re-sends). Known trade-off: anyone who knows an invited address can
    burn its five attempts — the cost is one "resend" click by the admin, never a takeover.
* **Forgot password** is the third use of the same code machinery (same hash, columns, 5-attempt rule, `EMAIL_OTP_TTL_MINUTES`):
  * `POST /auth/forgot-password { email }` e-mails a reset code to a **verified, active user with a password** whose organization is
    not rejected/suspended, and answers `200` with the **same body for every address** (also for every refusal: cooldown / quota apply
    to unknown addresses too). Unverified accounts use their verification code, invited ones their invitation: nothing is mailed;
  * `POST /auth/reset-password { email, code, password, password_confirmation }` redeems it. **One transaction** changes the password
    and deletes every token of the user (a stolen session must not survive a reset); the update is conditional on the very code that was
    checked, so the code is single-use even under parallel requests; the failed-login lockout is lifted; the owner gets a "password
    changed" e-mail (no code, no link) so a reset they did not ask for is noticed;
  * **a code's purpose is the account's state** — no password: invitation · password, not verified: verification · password and
    verified: reset. The three states are mutually exclusive, so no schema column is needed and a code of one kind cannot be redeemed
    as another (tests cover every pair). If a fourth kind ever overlaps these states, add a `purpose` column first;
  * **brute-force cap.** Anyone may request a new code, and each new code resets the 5-attempt counter, so "5 guesses per code" alone would
    allow endless guessing. On top of it, **10 wrong guesses per address per hour (summed over all codes)** block the address (`429`) until
    the hour is over, and nothing is mailed meanwhile. A deliberate trade-off: whoever knows an address can keep its owner from resetting for
    up to an hour — the owner still has the password they know; an attacker cannot reach more than 10 guesses / hour / address
    (240 guesses a day out of 1,000,000 possible codes ≈ 0.024 % per day of sustained attack, and the e-mailed code also expires after 15 minutes);
  * **no enumeration.** Every `429` about a code carries one text; the cap counts failures for existing and unknown addresses alike; a new
    code request gives fresh attempts to both (otherwise "still locked after a re-send" would mark the unknown ones). The same fix applies to
    `POST /auth/resend-verification`.
* Security headers (Helmet), `Cache-Control: no-store` on every response, JSON body limit 1 MiB, prototype-poisoning-safe
  JSON parsing, `Authorization`/`Cookie` redacted from logs.

## 2. Organization lifecycle
`organizations.status` drives the `onboarding_status` the frontend routes on.

| status | `onboarding_status` returned | Can log in | How it is entered |
|---|---|---|---|
| `incomplete` | `incomplete` → UI: **needs onboarding** | yes | registration |
| `pending_approval` | `pending_approval` → UI: **waiting approval** | yes | `POST /organization/o` succeeded |
| `approved` | `approved` → UI: **dashboard** | yes | platform operator approves (CLI or `/platform/…`) |
| `rejected` | – | **no** (`403`, live sessions end) | operator rejects a `pending_approval` organization (reason required, e-mailed) |
| `suspended` | – | **no** (`403`, live sessions end) | operator suspends an `approved` organization |

Transitions: `incomplete → pending_approval → approved`; `pending_approval → rejected`; `approved → suspended`;
`rejected | suspended → approved` (reactivation). Anything else is `409`. Platform operators (`is_platform_admin`, no
organization) always report `approved`.

* Business endpoints (everything except `/auth/me`, `/logout`, `/organization/*`) return **`403`** until the organization is
  `approved`.
* Onboarding (`POST /organization/o`) is only for the organization's **system admin**, only while `incomplete` (a second or
  concurrent submit gets `409`). Organization **name and type are locked** after registration (the payload values are ignored);
  e-mail and phone are updated; the free-mail rule applies to the e-mail.
* Documents (`POST /organization/documents`) are accepted while `incomplete` **and** `pending_approval` (the form uploads them
  after the profile), not after approval.
* Approving notifies the organization's members and e-mails its admins; rejecting/suspending e-mails the reason.

## 3. Permission catalog (RBAC)
Roles hold a subset of these keys. A role flagged `is_system_admin` implicitly holds all of them (its list cannot be edited,
only its title). `GET /permissions` returns this list.

| Key | Gates |
|---|---|
| `requests.view` | list/detail requests; comment on and attach files to requests; download attachments |
| `requests.create` | `POST /requests` |
| `requests.approve` | `POST /requests/{id}/approve`, `/reject` |
| `tasks.view` | list/detail tasks; comment/attach; assignees update their own task's status/progress |
| `tasks.create` | `POST /tasks`, `POST /requests/{id}/tasks` (also needs `requests.view`) |
| `tasks.update` | `PATCH /tasks/{id}` for any field and any task |
| `employees.view` / `employees.manage` | list employees / create, edit, delete |
| `roles.view` / `roles.manage` | list roles + `GET /permissions` / create, edit |
| `files.view` / `files.upload` | list, download / upload files, create folders |
| `reports.view` / `reports.manage` | summary, list, download / `POST /reports` |
| `units.view` / `units.manage` | `GET /units` / `PATCH /units/{id}` |
| `settings.manage` | `PUT /options/{kind}` |
| `meal.view` / `meal.manage` | every `GET /meal/*` / every MEAL write |
| `projects.view` / `projects.manage` | list and read the caller's projects / create projects and build their teams (holders also see **every** project) |
| `beneficiaries.view` / `beneficiaries.edit` | read / register and edit a project's beneficiaries and their files (also requires being on the project's team) |

There are **23 keys** in total (`GET /permissions`). A permission says WHAT a person may do; membership of a project says WHERE
(§9). The four fixed job categories carry fixed packages of these keys (`api-contracts.md` §8b).

Open to **every approved member** (no permission): `GET /options`, `GET /dashboard/summary` (the request/task *lists* inside it
need `requests.view` / `tasks.view`; the counters do not), the user's own `/notifications`, `/auth/me`, `/logout`.
Platform routes (`/platform/**`) need `is_platform_admin`.

MEAL endpoints additionally require the **MEAL unit to be switched on** for the organization (`PATCH /units/1`): otherwise
`403 وحدة المتابعة والتقييم غير مفعّلة لمؤسستك.`

## 4. Privilege-escalation and safety rules
Enforced in the service layer (`backend/src/modules/people/service.js`), not by the UI:

* **Nobody can grant permissions they do not hold.** Creating/editing a role, or assigning a role to an employee, fails with
  `422` if the role contains a permission the actor lacks. Only a system admin may assign the system-admin role.
* **Non-admins cannot touch more powerful people or roles.** Editing/deleting an employee whose role is system-admin or has
  permissions beyond the actor's → `403`; editing such a role → `403`. No self-promotion.
* The system-admin role always keeps every permission, whatever a client sends.
* **An organization always keeps ≥ 1 active system admin**: demoting, deactivating or deleting the last one → `409`.
* You cannot **delete** or **deactivate** your own account (`409`).
* Changing an employee's **e-mail** un-verifies it, ends their sessions and mails a new 6-digit code to the new address (the user
  verifies it on `/verify-email` — the login screen links there when a user is not verified). An employee who has not accepted their
  invitation yet gets a **new invitation** at the new address instead (the old code is dead).
* A new employee has **no password**: the invitation e-mail lets them choose one on `/set-password`; until then `can_login` is
  `false` and `invite_pending` is `true` (the employees screen shows "بانتظار التفعيل" and a resend button).
* Clients cannot set server-owned fields: `organization_id`, `is_platform_admin`, passwords, verification dates, codes,
  `creator_id`, request status, …(strict allow-lists; unknown fields are ignored).
* **Tenant isolation:** every business table has `organization_id` and every query is scoped by the token's organization; other
  tenants' ids simply return `404`.
* A task's **assignee** without `tasks.update` may change only `status`/`progress` of their own task (`403` otherwise).
* **Separation of duties:** nobody approves or rejects a request they submitted themselves — `403`, whatever their rank, the system
  admin included. The check runs after the project check (`404` outside the team, `403` for a member who is not a supervisor) and
  before the status update (`409` if the request is no longer `pending`).

## 5. Uploads and downloads
The file type is decided from the **content** (magic bytes), never from the client's name or MIME. Names are sanitised for
display; storage keys are generated (`org-<id>/…/<uuid>`). Every download is an `attachment` with `X-Content-Type-Options: nosniff`
and an RFC 5987 UTF-8 filename. Any failure aborts the whole request and removes already-written files.

| Upload | Field | Accepted | Limits |
|---|---|---|---|
| Onboarding documents | `documents[]` | PDF, PNG, JPEG | 5 MB each, 10 per request, 20 per organization |
| Request / task / beneficiary attachment | `file` | any type (beneficiary: documents and images) | `MAX_UPLOAD_MB` (10), 20 per item |
| File manager | `file` + `folder_id` (required) | any type | `MAX_UPLOAD_MB` |
| Report | `file` (+ `name`, `type`, `period`, `folder_id` and/or `project_id`) | any type | `MAX_UPLOAD_MB` |
| MEAL field-record evidence | `attachments[]` | PDF, PNG, JPEG | 5 MB each, 10 per record |
| MEAL indicator import | `file` | CSV text (binary rejected) | `MAX_UPLOAD_MB`, ≤ 1000 rows, all-or-nothing, not stored |

Too large → `413`; wrong type / empty / unexpected field → `422`.

## 6. Rate limits
Per-IP limits use `@fastify/rate-limit`; per-identity limits are in memory (**per process** — use a shared store if you run
several instances). All counts are multiplied by `RATE_LIMIT_SCALE` (keep `1` in production; e2e uses `1000`). Exceeded → `429`.

**Which address is "the IP"?** `request.ip`. Browsers never reach this API — the Next.js server (BFF) does — so without help every
visitor shares one address and one bucket. The BFF therefore forwards the visitor's address as `X-Forwarded-For` (only the entry its
own trusted reverse proxy appended; `TRUSTED_PROXY_HOPS` on the frontend) and the API believes it only from the peer named in
`TRUST_PROXY` (`false` | `true` | a list of addresses / CIDR ranges / `loopback`). A list is the safe setting; `true` lets any direct
caller forge its address. Invalid values stop the server from starting. Details and a deployment table:
[backend/README.md](../backend/README.md#real-client-addresses-trust_proxy). The per-identity limits below do not depend on addresses.

| Route | Limit |
|---|---|
| `POST /auth/register` (and its alias `/register-organization`) | 10 / 10 min / IP |
| `POST /auth/verify-email` | 30 / 10 min / IP **and** 5 wrong attempts per code (database counter; 5 failures / `EMAIL_OTP_TTL_MINUTES` / address for addresses without an active code) |
| `POST /auth/resend-verification` | 10 / 10 min / IP **and** 3 / 10 min / e-mail **and** a 60 s cooldown per e-mail |
| `POST /auth/set-password` | 30 / 10 min / IP **and** 5 wrong attempts per invitation code (no public resend: only an admin re-issues it, ≤ 5 / employee / 10 min) |
| `POST /auth/forgot-password` | 10 / 10 min / IP **and** 3 / 10 min / e-mail **and** a 60 s cooldown per e-mail — all identical for unknown addresses |
| `POST /auth/reset-password` | 30 / 10 min / IP **and** 5 wrong attempts per code **and** 10 wrong attempts / hour / e-mail across all codes (counted for unknown addresses too) |
| `POST /login` | 30 / 5 min / IP **and** 5 failures / 15 min / e-mail (a success clears the counter; so does a password reset) |

## 7. Workflows and business logic

### Request → task lifecycle (automatic)
```
create ─▶ pending ──approve──▶ approved ──(first task created from it)──▶ in_progress ──(all linked tasks done)──▶ completed
             └─reject(reason)─▶ rejected                                       ▲──(a finished task is reopened)────────┘
```
* Approve / reject only work on `pending` (a second or concurrent decision → `409`); reject needs a `reason`.
* `POST /requests/{id}/tasks` copies title, description, priority and department and links the request. A request that is
  `pending` or `rejected` keeps its status whatever happens to its tasks. Each automatic step adds a line to the request's
  activity log. Creating a task also logs `تم إنشاء المهمة TSK-… من هذا الطلب.`
* Setting a task to `done` sets `progress = 100` (unless sent) and `completed_at`; reopening clears `completed_at`.
  `completed_at` drives `monthly_progress` in `GET /reports/summary` (tasks completed this month vs last month).
* Codes are per-organization sequences: `REQ-001`, `TSK-001`, `FCRM-900…` (complaints start at 900).

### MEAL
* **Indicator status** is derived from `achieved / target`: `≥ 100%` achieved · `≥ 70%` on_track · `≥ 40%` needs_follow ·
  below that delayed; nothing reported yet = `needs_follow`. Recomputed on every change.
* Every change of an achieved value (manual `PATCH`, CSV import with `achieved`, field-record submission) is written to
  `indicator_updates` (delta, value after, source, user). `GET /meal/charts?quarter=Qn` reads it: *actual as of the end of
  quarter n* per sector against the sector's total target. Quarters offered: this year's, up to the current one.
* **Field records**: a `draft` may be incomplete and never touches the indicator. A `submitted` record requires project, sector,
  activity type, date, region, indicator and achieved value, **adds** `achieved_value` to the indicator atomically (concurrent
  submissions all count) and counts its `total_beneficiaries` in the stats and the distribution chart (by region).
* Complaints: `status=sensitive` in `GET /meal/complaints` is a pseudo-status (priority = sensitive, any status). The reporter's
  name and the description are stored but **never returned or exported**.
* MEAL report document (`/meal/reports/{id}/download`) is a self-contained, escaped RTL **HTML** page rendered from live data
  (print it to PDF). It is not a PDF.
* Complaint/report statuses can move freely between any two values (as the UI allows).

## 8. Notifications (created by the backend, read via `/notifications`)
Nobody is ever notified about their own action.

| Event | Recipients | Type · link |
|---|---|---|
| Organization approved | all active members of the organization | `system` · `/dashboard` |
| Request created | the people who may decide it: holders of `requests.approve` who are supervisors of the request's project or hold `projects.manage` (never the requester) | `task` · `/dashboard/requests/{id}` |
| Request approved / rejected | the requester | `system` / `alert` · request |
| Comment on a request | the requester | `system` · request |
| Task assigned (create or reassign) | the new assignee | `task` · `/dashboard/tasks/{id}` |
| Task completed by someone else | the task's creator | `task` · task |
| Comment on a task | assignee and creator | `task` · task |
| Added to a project team | the people added (`PUT /projects/{id}/members`) | `system` · the project |
| Sensitive complaint logged | other `meal.manage` holders on the complaint's project team | `alert` · `/dashboard/meal/complaints` |
| MEAL report status changed by someone else | the report's owner | `alert` if `needs_edit`, else `system` · `/dashboard/meal/reports` |

## 9. Projects: who may touch what
Source: `backend/src/modules/projects/access.js`. Every request, task, folder, file, report, beneficiary and MEAL record belongs to a
project (`project_id` is `NOT NULL`, migrations `…11` and `…12`); there is no organization-wide work.

| Who | Reach |
|---|---|
| **Full access** — the system admin, or anyone holding `projects.manage` | every project of the organization (role shown as `admin`) |
| **Supervisor** — a team member the admin marked `supervisor` | their projects; also approves/rejects the project's requests and edits other people's tasks (with `tasks.update`) |
| **Member** | their projects only |
| Anyone else | the project **does not exist** for them: `404`, never `403` |

* A plain member who tries a supervisor-only action gets `403` (they can see the project, just not do this).
* A write that names a project the caller does not work in is `422` on `project_id`; a missing project is `422` too.
* Lists, counters, dashboard, MEAL statistics, charts, exports and the activity feed include only the caller's projects.
* A task's assignee must be on the project's team (`422` on `assignee_id`).
* The permission package is checked **in addition**: e.g. reading a beneficiary needs `beneficiaries.view` **and** being on the team.

## 10. Known limits and open items
1. ~~Forgot-password / reset is missing.~~ Done (§1: `POST /auth/forgot-password`, `POST /auth/reset-password`, the `/forgot-password` and
   `/reset-password` pages). Open: the codes use an in-memory limiter (per process, like the other per-identity limits), so behind several
   backend instances the hourly failure cap is per instance — use a shared store before scaling out (§6). No second factor / "log out
   everywhere" yet.
2. **PostgreSQL:** the whole backend suite (499 tests) passes on PostgreSQL 17 too (`TEST_DATABASE_URL=postgres://… npm test` creates a throw-away database per test); the e2e against PostgreSQL and a production deployment have not been exercised yet.
3. A `rejected` / `suspended` organization cannot log in (`403`). The login response carries `organization_status` and the operator's
   `reason` (only after the password is right) and the login screen shows them with a support link.
4. `/meal/reports/{id}/download` is HTML, not PDF (Arabic shaping makes server-side PDF generation unreliable).
5. In-memory per-identity rate limits are per process (see §6). Token refresh / "log out everywhere" are not implemented.
6. The only delete endpoint is `DELETE /employees/{id}`: there is none for files, reports, attachments, folders, projects, beneficiaries or MEAL records.
7. The built-in unit catalog has three units (MEAL, field operations, HR; only MEAL has screens). Field operations is toggleable but has no module behind it; HR is "in development".
   The sidebar also lists three "(قريباً)" entries that lead nowhere.
8. The backend is **not in CI** yet (`.github/workflows` run the frontend only, on Node 20; the backend needs Node 22+ and was
   developed on 24).
9. ~~Two Playwright tests fail on a React hydration error (#418).~~ Fixed — see [roadmap-and-issues.md](./roadmap-and-issues.md).
