# API contracts

> The HTTP API implemented by **`backend/`** (Node 22 · Fastify · Knex) and consumed by the Next.js BFF. `API_URL` = its base
> URL, e.g. `http://localhost:4010` (a trailing `/api` is accepted too: `/api/login` ≡ `/login`). All bodies are JSON unless
> marked *multipart*. Auth = `Authorization: Bearer <token>` (added by the BFF from the HttpOnly cookie). Rules behind the
> endpoints — permissions, lifecycle, uploads, rate limits, notifications — are in [backend-rules.md](./backend-rules.md).
>
> **Status:** every endpoint below is implemented and covered by the backend tests (499) and by the HTTP + browser e2e suites
> run against it (`npm run e2e:real`). The legacy mock (`scripts/mock-backend.mjs`) implements the same contract with
> fabricated data and is kept only for frontend-only demos.

## Conventions
* **Lists:** `{ "data": [...], "meta": { "total", "current_page", "per_page", "last_page", ...extras } }`. Unpaginated lists
  (`/units`, `/roles`, `/permissions`, `/files/folders`, `/meal/report-templates`, `/employees` without `page`) return
  `meta: { total }`. **Single objects:** `{ "data": {...} }`. Query params: `page`, `per_page` (default 10, max 100), `search`,
  plus filters; a filter value of `all` (or empty) means "no filter". `search` is a case-insensitive "contains" (`%`/`_` are literal).
* **Dates:** ISO-8601 UTC timestamps (`2026-03-02T00:00:00.000Z`); date-only fields are `YYYY-MM-DD` and must be real dates.
  **Money/amounts:** numbers. **Ids:** integers (`id` in the URL must be numeric, otherwise `404`); human-readable `code`s
  (`REQ-001`, `TSK-001`, `FCRM-900`) are per organization.
* **Enums are codes** (Arabic labels live in `src/lib/labels.js`). Unknown enum values are `422` in bodies and simply match
  nothing in filters.
* **Downloads** (`…/download`, `…/export`) return the raw file with `Content-Type` + `Content-Disposition: attachment`.
* Blank strings from forms (`""`) are treated as "not provided"; in `PATCH`/`PUT` bodies `""`/`null` **clear** nullable fields.
* Unknown body fields are ignored (never mass-assigned).

### Errors
| Status | Body | When |
|---|---|---|
| `401` | `{ "message": "غير مصرّح." }` | no/invalid/expired token, deactivated user, suspended/rejected organization |
| `403` | `{ "message": "ليست لديك صلاحية لتنفيذ هذا الإجراء." }` | missing permission, organization not approved, MEAL unit off, escalation attempt |
| `404` | `{ "message": "الطلب غير موجود." }` | unknown id, another organization's id, non-numeric id |
| `409` | `{ "message": "تم البت في هذا الطلب مسبقاً." }` | state conflict (already decided, duplicate onboarding, last admin, …) |
| `413` | `{ "message": "حجم الملف أكبر من المسموح." }` | upload / JSON body too large |
| `422` | `{ "message", "errors": { "field": ["msg", …] } }` | validation (Laravel-style; nested paths like `sectors.0`) |
| `429` | `{ "message": "طلبات كثيرة، حاول لاحقاً." }` | rate limit |
| `400` | `{ "message" }` | malformed JSON · `500` generic (details only outside production) |

```json
// POST /register-organization  (invalid)           → 422
{ "message": "البيانات المدخلة غير صالحة.",
  "errors": { "organization_email": ["يرجى استخدام بريد مؤسسة رسمي (غير مسموح ببريد مجاني Gmail/Yahoo)."],
              "admin_password": ["كلمة المرور يجب أن تكون 8 أحرف على الأقل.", "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل."],
              "agreed_to_terms": ["يجب الموافقة على الشروط والأحكام."] } }
```

## 1. Public (no token)
| Endpoint | Request | Response |
|---|---|---|
| `POST /auth/register` (alias `POST /register-organization`) | `organization_name, organization_email, admin_email, organization_region, organization_phone (≥ 8), admin_password, admin_password_confirmation, organization_type ("ngo"\|"ingo"\|"gov"\|"company", case-insensitive, default ngo), agreed_to_terms, admin_name?` | `201 { message, expires_in_minutes }`. A **6-digit code is e-mailed** (never returned). `organization_email` must not be a free-mail domain (gmail, yahoo, hotmail, outlook, …). Duplicate `admin_email` → `422` on `admin_email`; password mismatch → `422` on `admin_password`. Creates the organization (`incomplete`), its system-admin role, the admin user and default lists (no folders: folders belong to projects) |
| `POST /auth/verify-email` | `{ email, code }` — `code` = exactly 6 digits (a pasted `"123 456"` is accepted) | `200 { verified: true, message }` · wrong or expired code → `422 { message, errors: { code: [..] } }` · after **5 wrong attempts** the code is invalidated → `429` until a new one is requested · malformed code → `422` on `code`. Unknown and already-verified addresses answer exactly like wrong codes |
| `POST /auth/resend-verification` | `{ email }` | `200 { message, expires_in_minutes, resend_after_seconds }` — the previous code is **invalidated**, a new one is e-mailed, the attempts reset. Same answer for unknown e-mails; `400` "already verified"; `429` during the 60 s cooldown (`يرجى الانتظار N ثانية…`) or after 3 codes in 10 minutes. **An invited employee (no password yet) gets the same `200` but nothing is mailed** — only an admin can re-issue an invitation |
| `POST /auth/set-password` | `{ email, code, password, password_confirmation }` — `code` = the 6-digit **invitation code** e-mailed to an employee an admin added; `password` ≥ 8 chars with a digit and a symbol | `200 { activated: true, message }` — sets the first password **and** verifies the e-mail in one step; the employee then signs in with `POST /login`. Wrong or expired code → `422 { errors: { code: [..] } }` · weak / unconfirmed password → `422` on `password` (**no attempt is used**) · after **5 wrong attempts** → `429` until an admin re-sends the invitation (`POST /employees/{id}/invite`). Only accounts **without a password** are eligible: unknown, already-activated and ordinary (verified or registering) addresses answer exactly like a wrong code (five `422`, then `429`) and nothing about them changes |
| `POST /auth/forgot-password` | `{ email }` | **always** `200 { message, expires_in_minutes, resend_after_seconds }` — the same body for every address, so it never reveals whether an account exists. A 6-digit **reset code** is e-mailed (never returned) only to a **verified, active user with a password** (any organization member or platform operator whose organization is not rejected/suspended); unknown, unverified, invited, inactive and blocked accounts get the same answer and **no mail**. A new request invalidates the previous code and gives fresh attempts. `429` for everyone alike: 60 s cooldown (`يرجى الانتظار N ثانية…`) or 3 requests / 10 min / address. While the address is over its hourly failure cap (below) nothing is mailed |
| `POST /auth/reset-password` | `{ email, code, password, password_confirmation }` — `code` = the 6-digit reset code; `password` ≥ 8 chars with a digit and a symbol | `200 { reset: true, message }` — sets the new password, **ends every session of the user** (all their tokens are deleted), lifts the failed-login lockout and e-mails a "password changed" notice (no code, no link). Wrong or expired code → `422 { errors: { code: [..] } }` · weak / unconfirmed password → `422` on `password` (**no attempt is used**) · after **5 wrong attempts** on one code → `429` until a new one is requested · after **10 wrong attempts within an hour, summed over all codes** → `429` (`تجاوزت عدد المحاولات الخاطئة خلال الساعة الأخيرة…`) for the rest of that hour. Only verified accounts with a password are eligible: unknown, unverified and invited addresses answer exactly like a wrong code, with the same `429` texts |
| `POST /login` | `{ admin_email, admin_password }` | see below |

_Removed with the move to codes: `GET /email/verify/{id}/{hash}`, `GET /email/verification-status`, `POST /email/resend-verification` (all `404` now), the BFF route `/api/auth/verify-link` and `verification_url` in the register response._

```json
// POST /auth/verify-email  { "email": "admin@org.org", "code": "482915" }
// → 200
{ "verified": true, "message": "تم تفعيل البريد بنجاح." }
// → 422 (wrong or expired)
{ "message": "الرمز غير صحيح أو منتهي الصلاحية.", "errors": { "code": ["الرمز غير صحيح أو منتهي الصلاحية."] } }
// → 429 (5 wrong attempts)
{ "message": "تجاوزت عدد المحاولات المسموح بها. اطلب رمزاً جديداً." }
// POST /auth/resend-verification  { "email": "admin@org.org" } → 200
{ "message": "إذا كان البريد مسجلاً فسيصلك رمز تحقق جديد خلال لحظات.", "expires_in_minutes": 15, "resend_after_seconds": 60 }
```

```json
// POST /login → 200
{ "token": "mt_<43 url-safe chars>",
  "user": { "id": 1, "name": "ليلى المحمود", "email": "admin@org.org", "role": "مديرة النظام",
            "onboarding_status": "approved", "is_system_admin": true, "is_platform_admin": false,
            "permissions": ["employees.manage", "…"] } }
```
`is_platform_admin: true` marks a **platform operator** (staff of the platform itself, no organization). Their `onboarding_status` is
`approved`, but every business endpoint answers `403` for them (only `/platform/…` works), so the frontend routes them to `/operator`
instead of the dashboard.
`401` wrong credentials; `403` e-mail not verified / user inactive / organization suspended or rejected (only after the password
is correct; for a blocked organization the body also has `organization_status: "suspended"|"rejected"` and `reason` — the operator's text or `null`);
`429` after 5 failures for an e-mail.

`onboarding_status` → UI state: `approved|completed|active|verified` → **approved**; `pending_approval|under_review|submitted|in_review|pending`
→ **pending approval**; anything else (the backend sends `incomplete`) → **needs onboarding**. The backend always sends it.

## 2. Session & onboarding (token required; allowed before approval)
| Endpoint | Notes |
|---|---|
| `GET /auth/me` | `{ user: { id, name, email, role, onboarding_status, is_system_admin, is_platform_admin, permissions[] }, organization: { id, name, type, email, phone } \| null }` (organization is `null` for platform operators) |
| `POST /logout` | `200 { ok: true }`; revokes only the presented token (works with a JSON content-type and an empty body) |
| `POST /auth/logout-all` | `200 { ok: true, sessions_ended }`; revokes **every** session of the user, the presenting one included (any signed-in account, platform operators too); audit `auth.logout_all`; 20 per IP per 10 minutes |
| `POST /organization/o` | System admin of an `incomplete` organization only. Required: `registration_number, country, phone (≥ 8), email (not free-mail), contact_person_name`. Optional: `organization_name`/`organization_type` (**ignored** – locked), `address, sectors[] (strings, ≤ 30), organization_size, years_of_experience, notes` (the former `volunteers_count` is **no longer stored or returned** — volunteer management is out of scope; an older client that still sends it is not rejected, the value is ignored). → `201 { ok, onboarding_status: "pending_approval", message }`; second submit `409` |
| `POST /organization/documents` *(multipart `documents[]`)* | PDF/PNG/JPEG (checked by content), ≤ 5 MB each → `201 { stored: n }`. Allowed while `incomplete`/`pending_approval` |

## 3. Lookups & overview (approved organization)
| Endpoint | Permission | Response / notes |
|---|---|---|
| `GET /options` | any member | `{ data: { departments[], request_types[], task_types[], projects[], sectors[], regions[], activity_types[], complaint_types[], channels[], report_types[], periods[], employees: [{ value: id, label: name }] } }` — strings (or `{value,label}`), employees = active users |
| `GET /dashboard/summary` | any member | live data; lists need `requests.view` / `tasks.view` (else `[]`) — see example |
| `GET /units` | `units.view` | `[{ id, key, title, description, status: active\|inactive\|in_development\|setup_required, tier: core\|optional, roles_count, screens_count, manager_roles, icon, href }]` |
| `PATCH /units/{id}` `{ enabled: boolean }` | `units.manage` | `{ data: unit }`; `422` for an `in_development` unit or a non-boolean `enabled` |
| `GET /notifications?per_page` | any member | own notifications, newest first; `meta.unread_count`; item `{ id, title, message, type: system\|task\|alert, is_read, created_at, link? }` |
| `PATCH /notifications/{id}/read` | any member | `{ ok: true }`; someone else's id → `404` |
| `POST /notifications/read-all` | any member | `{ ok: true, updated: n }` |

`icon` keys: `monitor map-pin users bar-chart briefcase shield folder`. Units without an `org_units` row default to *enabled iff core*.

```json
// GET /dashboard/summary → 200 (trimmed)
{ "data": {
  "stats": { "active_users":       { "value": 5, "trend_text": "+5 هذا الشهر", "trend": "up" },
             "open_tasks":         { "value": 9, "trend_text": "بدون تغيير", "trend": "neutral" },
             "running_operations": { "value": 8, "trend_text": "4 بانتظار الموافقة", "trend": "neutral" },
             "important_alerts":   { "value": 2, "trend_text": "تتطلب إجراء", "trend": "down" } },
  "weekly_activity": [{ "date": "2026-11-09", "requests": 0, "tasks": 0 }, "… 7 days"],
  "active_units": [{ "id": 1, "title": "المتابعة والتقييم", "icon": "bar-chart" }],
  "pending_approvals": [{ "id": 19, "title": "طلب اختبار رقم 19", "amount": 2800, "department": "العمليات", "created_at": "…" }],
  "recent_requests": [{ "id": 23, "code": "REQ-023", "title": "…", "status": "rejected", "priority": "high", "type": "…", "department": "…", "amount": 3200, "requester": { "name": "…" }, "created_at": "…" }],
  "open_tasks": [{ "id": 11, "code": "TSK-011", "title": "…", "status": "blocked", "assignee": "جلال العمر", "due_date": "2026-07-02" }] } }
```
`running_operations` = approved + in-progress requests; `important_alerts` = the user's unread notifications; weekly activity = rows
created per UTC day over the last 7 days; lists are newest first (3 pending approvals, 4 recent requests, 3 open tasks).

## 4. Requests
Request: `{ id, code, title, status, priority, type, department, description, amount, requester: { id, name }, created_at, updated_at, rejection_reason? }`
(detail adds `comments[]`, `attachments[]`, `activities[]`) · `status`: `draft pending approved in_progress completed rejected` ·
`priority`: `low medium high urgent` · Comment `{ id, author: { name, role }, body, created_at }` · Attachment `{ id, name, size, mime, created_at }` ·
Activity `{ id, text, kind: created|reviewed|pending|rejected, created_at }` (oldest first).

| Endpoint | Permission | Notes |
|---|---|---|
| `GET /requests?status&priority&search&page&per_page` | `requests.view` | newest first; `meta.status_counts` = count for **every** status under the current `search`/`priority` (ignores the selected status tab) |
| `POST /requests` | `requests.create` | `{ project_id* (a project the caller works in, else `422`), title* (≤ 255), type* , department, priority (default medium), amount (0 … 1 000 000 000), description }` → `201 { data }` (status `pending`); notifies approvers |
| `GET /requests/{id}` | `requests.view` | full detail |
| `POST /requests/{id}/approve` | `requests.approve` | `200 { data }`; not `pending` → `409`; **separation of duties:** the person who submitted the request never decides it (`403`, whatever their rank) |
| `POST /requests/{id}/reject` `{ reason* }` | `requests.approve` | `200 { data }` (includes `rejection_reason`); not `pending` → `409`; own request → `403` as above |
| `POST /requests/{id}/comments` `{ body* }` | `requests.view` | `201 { data: comment }` |
| `POST /requests/{id}/attachments` *(multipart `file`)* | `requests.view` | any type, ≤ `MAX_UPLOAD_MB`, ≤ 20 per request → `201 { data: attachment }` |
| `GET /requests/{id}/attachments/{aid}/download` | `requests.view` | |
| `DELETE /requests/{id}/attachments/{aid}` · `DELETE /tasks/{id}/attachments/{aid}` | `requests.view` · `tasks.view` | `204`; removes the row and the stored file and writes an audit entry (`attachment.deleted`). Allowed for whoever attached it, a project supervisor, or full project access; another member `403`; outside the project / organization `404` |
| `POST /requests/{id}/tasks` | `tasks.create` + `requests.view` | `201 { data: task }` pre-filled from the request; moves an approved request to `in_progress` |

```json
// GET /requests/2 → 200
{ "data": { "id": 2, "code": "REQ-002", "title": "طلب اختبار رقم 2", "status": "approved", "priority": "medium",
  "type": "مشتريات", "department": "المالية", "description": "وصف الطلب 2", "amount": 1100,
  "requester": { "id": 1, "name": "ليلى المحمود" }, "created_at": "2026-03-02T00:00:00.000Z", "updated_at": "2026-03-02T00:00:00.000Z",
  "comments": [], "attachments": [],
  "activities": [ { "id": 2, "text": "تم إنشاء الطلب", "kind": "created", "created_at": "…" },
                  { "id": 3, "text": "تمت الموافقة", "kind": "reviewed", "created_at": "…" } ] } }
```
```json
// GET /requests?per_page=2 → meta
{ "total": 23, "current_page": 1, "per_page": 2, "last_page": 12,
  "status_counts": { "draft": 3, "pending": 4, "approved": 4, "in_progress": 4, "completed": 4, "rejected": 4 } }
```

## 5. Tasks
Task: `{ id, code, title, description, status, priority, department, type, assignee_id, assignee: { id, name, role } \| null, creator: { name }, due_date, progress (0-100), request: { id, code, title } \| null, created_at, updated_at }`
(detail adds `comments[]`, `attachments[]`) · `status`: `todo in_progress blocked done`.

| Endpoint | Permission | Notes |
|---|---|---|
| `GET /tasks?status&priority&department&assignee_id&search&page&per_page` | `tasks.view` | newest first |
| `POST /tasks` | `tasks.create` | `{ title*, description, assignee_id, department, type, priority, due_date }` → `201 { data }`; assignee must be an active member (`422` on `assignee_id`); notifies the assignee |
| `GET /tasks/{id}` | `tasks.view` | |
| `PATCH /tasks/{id}` | `tasks.update`, **or** the assignee for `status`/`progress` only | any of `title, description, assignee_id, department, type, priority, due_date, status, progress (0-100 integer)`; `""`/`null` clear nullable fields; `status:"done"` ⇒ `progress:100` unless sent. → `200 { data }`; otherwise `403` |
| `POST /tasks/{id}/comments` `{ body* }` | `tasks.view` | `201 { data: comment }` |
| `POST /tasks/{id}/attachments` *(multipart `file`)* · `GET /tasks/{id}/attachments/{aid}/download` | `tasks.view` | as for requests |

## 6. People, files, reports
| Endpoint | Permission | Notes |
|---|---|---|
| `GET /employees?search&status&department&role_id` | `employees.view` | Employee `{ id, name, email, phone, role: { id, title } \| null, role_source: auto\|manual\|null, job_title, job_category, department, status: active\|inactive, can_login, invite_pending, created_at }`. `invite_pending` = has not chosen a password yet. **Unpaginated** unless `page`/`per_page` is sent |
| `POST /employees` | `employees.manage` | `{ name*, email* (unique across the platform), phone, role_id, department, job_title, job_category, status }` → `201 { data }`. **Role auto-assignment** (see §8b): without `role_id`, the role comes from `job_category`, else from the category the `job_title` implies. **No password is created** (`can_login: false`, `invite_pending: true`); when `status` is `active` a **6-digit invitation code is e-mailed** (valid `INVITE_TTL_HOURS`, default 48; never returned) which the employee enters on `/set-password` |
| `POST /employees/{id}/invite` | `employees.manage` | (Re-)sends the invitation: a fresh code, the previous one dies, attempts reset → `200 { message, expires_in_hours }`. `409` if the employee already has a password or is `inactive`; `403` for a more powerful employee; `404` across organizations; `429` after 5 sends / employee / 10 min |
| `PUT /employees/{id}` | `employees.manage` | applied as a merge (only sent fields change; `""` clears phone/department/role). Changing the e-mail un-verifies it and ends the user's sessions, and mails a verification code to the new address — or, for an employee who is still `invite_pending`, a **fresh invitation** |
| `DELETE /employees/{id}` | `employees.manage` | `204`; requests/tasks/comments stay (author shown as "مستخدم محذوف") |
| `GET /roles` | `roles.view` | Role `{ id, title, users_count, is_system_admin, permissions: [{ key, label }] }` |
| `GET /permissions` | `roles.view` | `[{ key, label }]` (23 keys, see backend-rules §3) |
| `POST /roles` · `PUT /roles/{id}` | `roles.manage` | `{ title*, permissions: [key] }` (PUT = merge); duplicate title `422`; unknown key `422`; escalation rules in backend-rules §4 |
| `GET /files/folders` | `files.view` | `[{ id, name, project_id, items_count }]` of the projects the caller works in (a new organization has none) |
| `GET /files?folder_id&search&page&per_page` | `files.view` | File `{ id, name, size, mime, folder_id, created_at }`, newest first |
| `POST /files` *(multipart `file`, `folder_id`)* | `files.upload` | any type → `201 { data: file }`; unknown/foreign folder → `422` on `folder_id` |
| `GET /files/{id}/download` | `files.view` | |
| `DELETE /files/{id}` | `files.upload` | `204`; removes the row and the stored file, audit `file.deleted`. Same who-may-delete rule as attachments (uploader, supervisor, full access; other members `403`; outsiders `404`) |
| `DELETE /files/folders/{id}` | `files.upload` | `204`; supervisor or full project access only (a plain member `403`). Deletes the folder **and the files inside it** (rows and stored files); reports filed in it are kept, taken out of the folder. Audit `folder.deleted` with the number of files removed |
| `GET /reports/summary` | `reports.view` | `{ data: { total_reports, monthly_progress, active_sections } }` — stored reports; % change of tasks completed this month vs last; active units |
| `GET /reports?type&search&page&per_page` | `reports.view` | Report `{ id, name, type, period, size, created_at }` |
| `GET /reports/{id}/download` | `reports.view` | the stored document (name/type as uploaded) |
| `DELETE /reports/{id}` | `reports.manage` | `204`; removes the row and the stored document, audit `report.deleted`. The author, a supervisor or full project access may delete it; another member `403` |

## 7. MEAL (26 contract endpoints + 1)
All need the MEAL unit switched on; **reads `meal.view`, writes `meal.manage`**. Details: [backend-rules.md §7](./backend-rules.md).

| Endpoint | Response / notes |
|---|---|
| `GET /meal/stats` | `{ data: { late_indicators, completion_rate, beneficiaries, active_projects, reports_in_review, complaints_in_progress } }`, each `{ value, trend?: { text, direction } }` (`trend` only when there is something to say) |
| `GET /meal/charts?quarter=Q1` | `{ data: { quarters: ["Q1".."Qn"], quarter, indicators: [{ sector, target, actual }], distribution: [{ label, percent }], total_beneficiaries } }` — `distribution` = beneficiaries of the quarter's submitted field records by region; invalid/future `quarter` → current quarter |
| `GET /meal/activity?type=all\|activity\|visit\|complaint&search&page&per_page` | merged feed `[{ id, type: activity\|visit\|complaint, status: completed\|sensitive\|in_progress\|documenting, location, project, title, date }]`, newest first; `activity` = all field work (visits included) |
| `GET /meal/complaints?status&project_id&region&priority&search&page` | `status`: `new in_progress resolved closed` **plus pseudo-status `sensitive`**. Item `{ id, code, type, project_id, project (name), region, channel, priority: low\|medium\|high\|sensitive, status, owner: { id, name } \| null, received_at }` |
| `GET /meal/complaints/stats` | `{ data: { total, new, in_progress, sensitive, resolved, sensitive_open } }` |
| `GET /meal/complaints/insights` | `{ data: { metrics: [{ label, value, level }], alerts: [{ text, level }] } }` (`level`: `danger warning info success`) |
| `POST /meal/complaints` | `{ type*, project_id*, channel*, region, priority (default medium), reporter_name, description }` → `201 { data }` (`FCRM-900…`, status `new`, owner = creator, today's date); sensitive ⇒ alerts other managers |
| `PATCH /meal/complaints/{id}` | `{ status?, owner_id? }` (at least one) → `200 { data }`; any status → any status |
| `GET /meal/complaints/export` | CSV (UTF-8 BOM, Arabic headers; same filters as the list; formula-injection safe) |
| `GET /meal/indicators?status&project_id&sector&search&page` | `status`: `on_track needs_follow delayed achieved`; item `{ id, code, name, project_id, project (name), sector, target, achieved, progress, status, updated_at, owner }` (creation order) |
| `GET /meal/indicators/stats` · `GET /meal/indicators/insights` | stats `{ total, projects_count, on_track, needs_follow, delayed, achieved }`; insights `{ insights: [{ text, level }], updates: [{ indicator_id, code, text }] }` (`updates` = not updated for ≥ 30 days) |
| `POST /meal/indicators` | `{ code* (unique per organization, case-insensitive), name*, project_id*, target* (> 0), sector, owner_id }` → `201 { data }`; duplicate → `422` on `code` |
| `PATCH /meal/indicators/{id}` | `{ achieved?, owner_id? }` → `200 { data }` (status recomputed, audited) |
| `POST /meal/indicators/import` *(multipart `file`, CSV)* | columns `code,name,project,target` (`project` = the project's NAME, one the caller works in; + optional `sector,achieved`; Arabic headers accepted) → `{ imported: n }`; all-or-nothing, `422` names the line |
| `GET /meal/indicators/export` | CSV |
| `GET /meal/reports?status&project_id&type&period&search&page` | `status`: `draft in_review needs_edit approved`; item `{ id, title, type, project_id, project (name), period, status, owner, updated_at }` (last updated first) |
| `GET /meal/reports/stats` · `GET /meal/reports/insights` | stats `{ total, draft, in_review, needs_edit, approved }`; insights `{ summary: [{ text, level }], actions: [{ text, level }] }` |
| `POST /meal/reports` | `{ title*, type*, project_id*, period, template_id }` → `201 { data }` (status `draft`) |
| `PATCH /meal/reports/{id}` `{ status }` | `200 { data }` |
| `GET /meal/report-templates` | `[{ id, name, type, description }]` (three built-in templates) |
| `GET /meal/reports/export` | CSV |
| `GET /meal/reports/{id}/download` | rendered RTL **HTML** document (not PDF) |
| `GET /meal/field-records?status&project_id&per_page` | `[{ id, project_id, project (name), sector, activity_type, activity_date, title, description, region, location, indicator_id, indicator: { id, code } \| null, achieved_value, total_beneficiaries, status: draft\|submitted, attachments: [{ id, name, size, mime }], created_at }]`, newest first |
| `POST /meal/field-records` *(multipart, or JSON without files)* | fields `project_id* (even for a draft; the indicator must belong to it), sector, activity_type, activity_date, title, description, region, location, indicator_id, achieved_value, total_beneficiaries, status (draft\|submitted)` + `attachments[]` (PDF/PNG/JPEG ≤ 5 MB, ≤ 10). `submitted` requires project, sector, activity_type, activity_date, region, indicator_id, achieved_value; it adds `achieved_value` to the indicator → `201 { data }` |
| `GET /meal/field-records/{id}/attachments/{aid}/download` | **extension** — serves the evidence file |

```json
// GET /meal/indicators?per_page=1 → 200
{ "data": [{ "id": 1, "code": "IND-1.1", "name": "مؤشر 1", "project": "مشروع ألف", "sector": "المياه",
             "target": 100, "achieved": 50, "progress": 50, "status": "needs_follow",
             "updated_at": "2026-11-10T07:55:18.041Z", "owner": { "id": 8, "name": "سلمى" } }],
  "meta": { "total": 6, "current_page": 1, "per_page": 1, "last_page": 6 } }
```
```json
// GET /meal/stats → 200
{ "data": { "late_indicators": { "value": 0 }, "completion_rate": { "value": 50 }, "beneficiaries": { "value": 0 },
            "active_projects": { "value": 2 },
            "reports_in_review": { "value": 1, "trend": { "text": "بانتظار الاعتماد", "direction": "neutral" } },
            "complaints_in_progress": { "value": 4 } } }
```

## 8. Endpoints beyond the original frontend contract
Added because the original contract left a gap. The frontend calls all of them (the settings page, the project pages and the reports pages).

| Endpoint | Permission | Why |
|---|---|---|
| `PUT /options/{kind}` `{ values: ["…"] }` | `settings.manage` | replaces one select-box list of the caller's organization (`kind` ∈ departments, request_types, task_types, projects, sectors, regions, activity_types, complaint_types, channels, report_types, periods; ≤ 200 unique values, ≤ 150 chars each). The only way `projects` — required by MEAL forms — can be defined |
| `POST /files/folders` `{ name, project_id* }` | `files.upload` | `201 { data: { id, name, project_id, items_count } }`; the project is mandatory (`422`); a duplicate name `422` within a project only |
| `POST /reports` *(multipart `file`, `name`, `type`, `period`)* | `reports.manage` | reports are stored documents; there is no generator (`201 { data }`, name defaults to the file name) |
| `GET /meal/field-records/{id}/attachments/{aid}/download` | `meal.view` | retrieve evidence files |
| `GET /health` | public | liveness + database check: `{ "status": "ok" }` / `503` |
| Platform operator routes (below) | `is_platform_admin` | review and decide on organizations |

Small additive fields: `meta.unread_count` on notifications, `updated` on read-all, `can_login` on employees, `progress` on indicators,
`owner_id` accepted on complaint/indicator `PATCH`, `is_system_admin` + `permissions[]` on `/login` and `/auth/me`.

### 8b. Job title → role → permissions (automatic role assignment)
A **fixed, deterministic** catalog in [backend/src/modules/people/job-roles.js](../backend/src/modules/people/job-roles.js) — no learning, no AI.
The organization does **not** invent job titles with new permissions: an employee belongs to one of **four categories**, and each comes with a
permission **package** split into what the person may **view** and what they may **edit**. (The platform operator and the organization's system
admin are not job categories.)

| Category (`job_category`) | Default role | View (`*.view`) | Edit | Matched by (examples) |
|---|---|---|---|---|
| `manager` | مدير | requests, tasks, employees, roles, files, reports, units, meal, projects, beneficiaries | requests.create/approve, tasks.create/update, files.upload, reports.manage, beneficiaries.edit | مدير، رئيس، مشرف، Manager, Director |
| `meal` | مسؤول متابعة وتقييم | requests, tasks, files, reports, units, meal, projects, beneficiaries | requests.create, tasks.create/update, files.upload, reports.manage, meal.manage, beneficiaries.edit | متابعة، تقييم، ميداني، باحث، M&E, Field |
| `finance` | مسؤول مالي | requests, tasks, files, reports, units, projects (**not** beneficiaries) | requests.create/approve, files.upload, reports.manage | مالي، محاسب، Finance, Accountant |
| `employee` | موظف | requests, tasks, files, reports, units, projects | requests.create, files.upload | anything else (least privilege) |

A title is matched in the order finance → meal → manager (most specific first: «مدير مالي» is `finance`); no match = `employee`. **No package holds an administrative key**: `roles.manage`, `settings.manage`, `employees.manage`, `units.manage`, `projects.manage` stay with
the system admin; an edit right always comes with the matching view right. The role is created in the organization with the package the first
time it is needed; if the admin has edited it since, **their version is used unchanged**. The package says WHAT a person may do; project
membership (§8c) says WHERE.

| Endpoint | Permission | Notes |
|---|---|---|
| `GET /job-categories` | `employees.view` | `[{ key, label, role_title, view: [key], edit: [key], permissions: [key] }]` — the packages above (keywords are not exposed) |
| `GET /employees/{id}/audit` | `employees.view` | role-assignment history, newest first: `[{ id, action: employee.role_auto_assigned\|employee.role_changed, actor: { id, name } \| null, meta: { from, to, category?, previous_source? }, created_at }]`; `404` across organizations |

Rules: (1) an explicit `role_id` always wins and marks the role `manual`; (2) a `manual` role is never touched by a later title change; changing it
is logged as `employee.role_changed` with `from`/`to`; (3) an `auto` role (or an empty one) follows the new category when the title/category
changes (`employee.role_auto_assigned`); (4) roles from before the feature (`role_source: null`) are left alone; (5) **no escalation** — an actor who
does not hold every permission of the default role gets no role assigned (and none is created); a system-admin role is never auto-assigned, and
no package holds an administrative key (above). Storage: `users.job_title/job_category/role_source`, table `audit_logs` (migration `…09`).

### 8c. Projects (a workspace per project)
New permission keys: `projects.view`, `projects.manage`, `beneficiaries.view`, `beneficiaries.edit` (23 keys now). Migration `…10`.
The system admin (or anyone holding `projects.manage`, who then sees all projects) creates a project and builds its team of **employees** and
**supervisors**. Requests, tasks, folders/reports and the beneficiaries registry then live inside it. **Reach:** a person sees and works in a project only if
they are on its team; everyone else gets `404` (the project "does not exist" for them). **A project is mandatory:** `project_id` is required on requests, tasks,
folders and reports, and every file lives in a folder — there is no organization-wide work (migration `…11` deleted the rows that had no project and made the columns `NOT NULL`).

| Endpoint | Permission | Notes |
|---|---|---|
| `GET /projects?status&search&page&per_page` | `projects.view` | the caller's projects (all of them with full access): `{ id, code (PRJ-001), name, description, status: active\|completed\|archived, start_date, end_date, my_role: admin\|supervisor\|member\|null, members_count, requests_count, tasks_count, beneficiaries_count, created_at }` |
| `POST /projects` | `projects.manage` | `{ name* (unique, any case), description, status, start_date, end_date }` → `201`; end before start → `422` |
| `GET /projects/{id}` · `PUT /projects/{id}` | `projects.view` · `projects.manage` | detail adds `members: [{ user_id, name, email, job_category, role_title, project_role }]`; PUT merges |
| `PUT /projects/{id}/members` | `projects.manage` | `{ members: [{ user_id, project_role: supervisor\|member }] }` replaces the team (active employees of the organization only; new members are notified) |
| `GET/POST /projects/{id}/beneficiaries` · `GET/PUT /beneficiaries/{id}` | `beneficiaries.view` · `beneficiaries.edit` (+ on the team) | Beneficiary `{ id, code (BEN-0001), project_id, full_name, national_id, gender: male\|female, birth_date, phone, region, address, household_size, notes, status: active\|inactive }`; list filters `search status region`; the same national id twice in one project → `422` |
| `POST /beneficiaries/{id}/attachments` · `GET …/attachments/{aid}/download` | `beneficiaries.edit` · `.view` | the beneficiary's file: documents and **images** |

Rules inside a project: **requests** — created by team members (`project_id`), listed/read/commented only by the team; **approve/reject needs the
supervisor role** (or full access) on top of `requests.approve`; approver notifications go to the project's supervisors and to people with full project access (never the requester). **Tasks** — assignee must be on the team (`422` on
`assignee_id`); a plain member only reports status/progress on their own tasks, a supervisor (with `tasks.update`) edits the rest. A task made from a
project's request inherits the project. `GET /requests` and `GET /tasks` accept `project_id`; the dashboard counters/lists only include what the caller reaches.
**MEAL** — indicators, complaints, field records and MEAL reports also belong to a project (`project_id` required, migration `…12`; the old free-text names became real projects). Lists, stats, insights, charts, exports and the activity feed only include the caller's projects; writing needs a project the caller works in (`422` on `project_id`), touching a row of another project is `404`; a sensitive-complaint alert goes only to that project's team. **Folders/files/reports** — `POST /files/folders {name, project_id*}` (same name allowed in different projects), `GET /files/folders?project_id`, `POST /files` needs a `folder_id` (`422` without one),
files in a project's folder follow the folder's reach; `POST /reports` takes `folder_id` and/or `project_id` (a project folder implies its project; one of them is required), `GET /reports?project_id&folder_id`,
`PATCH /reports/{id} { name?, type?, period?, folder_id? }` re-files a report (`""` = out of its folder, stays in the project; a folder of another project → `422`).
Images upload like any file. `GET /options` → `projects` lists the active projects the caller works in (plus any list kept by hand).

### Platform operator routes (internal tooling; same Bearer token from `/login`)
| Endpoint | Notes |
|---|---|
| `GET /platform/stats` | `{ data: { organizations: { total, by_status: { incomplete, pending_approval, approved, rejected, suspended } }, employees: { total, active }, beneficiaries_reached, health: { status, database, uptime_seconds, checked_at } } }` — platform-wide figures for the `/operator` console (employees = users that belong to an organization; beneficiaries = sum of `total_beneficiaries` over submitted field records) |
| `GET /platform/organizations?status&search&page&per_page` | `[{ id, name, type, email, phone, region, status, created_at, submitted_at, approved_at, rejection_reason, admin: { id, name, email }, employees_count, beneficiaries_reached }]`, newest first (`status=all` or omitted = every state) |
| `GET /platform/organizations/{id}` | adds `profile` (onboarding answers), `documents: [{ id, name, size, mime, created_at }]` and `admin_accounts: [{ id, name, email, status, verified, verified_at, has_password, last_login_at, code: { active, kind: invitation\|verification\|password_reset, sent_at, expires_at, attempts } }]` — the **state** of the admin's e-mail code, never the code itself (codes are stored only as keyed hashes) |
| `POST /platform/organizations/{id}/resend-verification` | e-mails a fresh code to the organization's unverified admin(s) → `200 { data }` (the refreshed organization detail); `409` when the admin is already verified or has not set a password yet; at most 5 per account per 10 minutes (`429`). The code is never returned |
| `GET /platform/organizations/{id}/documents/{docId}/download` | the uploaded document |
| `POST /platform/organizations/{id}/approve` | `200 { data }` — from `pending_approval`/`rejected`/`suspended` |
| `POST /platform/organizations/{id}/reject` `{ reason* }` | from `pending_approval` |
| `POST /platform/organizations/{id}/suspend` `{ reason? }` | from `approved` |

The same actions exist in the CLI (`npm run cli -- …`, see [../backend/README.md](../backend/README.md)).

### Test-only control plane (`ENABLE_TEST_CONTROLS=true`, never in production)
`POST /__control/reset` (restore demo data) · `GET /__control/log` · `POST /__control/fail` · `POST /__control/approve` ·
`GET /__control/state` · `GET /__control/mail` (the outbox — the only place a test can read the 6-digit code, exactly like a user reads
it from their inbox). Used by the e2e suite; see the backend README.

## 9. AI assistant — removed
The floating assistant (`/api/chat`, `CHAT_API_URL`, `/__chat`) was removed from the product on 2026-11-16. No AI feature exists in the API.
