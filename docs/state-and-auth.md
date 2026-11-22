# State & authentication

## Tokens and cookies
| Cookie | Written by | Flags | Meaning |
|---|---|---|---|
| `auth_token` | `POST /api/auth/login` | **HttpOnly**, `SameSite=Lax`, `Secure` in production, session cookie (30 days if "remember me") | the backend's opaque Bearer token (`mt_…`, stored there only as a SHA-256 hash, valid 30 days unless revoked). **Never visible to JavaScript**, never in `localStorage`/`sessionStorage`, never in a response body |
| `onboarding_status` | login, `GET /api/auth/session`, successful `POST /api/organization/o` | same | normalised status: `pending_onboarding` \| `pending_approval` \| `approved` \| `operator` (platform staff) |

* Only the BFF reads `auth_token`; `src/proxy.js` only checks that it exists. The status cookie is a **UX hint** for
  redirects — the backend is the authority and answers `401` (no/invalid/expired token, deactivated user, suspended or rejected
  organization) or `403` (organization not approved yet, missing permission) by itself.
* `normalizeOnboardingStatus()` / `statusForUser()` (`src/lib/session.js`) map any backend vocabulary to the three states (plus
  `operator` for platform staff, recognised by `is_platform_admin`); a **missing**
  status is treated as `approved` (documented risk). The backend **always** sends it: `incomplete` → `pending_onboarding`,
  `pending_approval`, `approved`. Organizations that are `rejected` or `suspended` cannot log in at all (`403`), and their live
  sessions end with `401`. The login `403` (sent only after the password was right) carries `organization_status` and the operator's
  `reason`, and the login screen explains it with a support link (see `docs/backend-rules.md` §2).
* `safeNextPath()` allows only same-site relative `?next=` values (blocks `//evil`, `https://…`, `javascript:`).

## Flows
```
register ─▶ code e-mailed ─▶ /verify-email (type the 6-digit code | "إعادة إرسال الرمز") ─▶ /activation-success ─▶ /login?next=/onboarding
login ─▶ BFF sets cookies ─▶ redirect by status:
   pending_onboarding → /onboarding  ──submit──▶ pending_approval → /onboarding/waiting-approval
   pending_approval   → /onboarding/waiting-approval ──(admin approves + "تحديث حالة الطلب")──▶ approved → /dashboard
   approved           → /dashboard (or the safe ?next= they came from)
   platform operator  → /operator (no organization: the dashboard would only answer 403)
401 from the API ─▶ http.js: POST /api/auth/logout (clears cookies) ─▶ /login?next=<current path>
logout button    ─▶ POST /api/auth/logout (revokes upstream, clears cookies) ─▶ /login

admin adds an employee ─▶ invitation code e-mailed ─▶ /set-password (e-mail pre-filled; code + new password) ─▶ /login?activated=1
forgot password  ─▶ /login "نسيت كلمة المرور؟" ─▶ /forgot-password (e-mail) ─▶ code e-mailed (same screen for every address)
                 ─▶ /reset-password (code + new password; "إعادة إرسال الرمز" with the server's cooldown) ─▶ /login?reset=1
                    (a reset ends EVERY session of that user: the next API call of an older session answers 401 → /login)
```
Route guard (`src/lib/access.js`, run by `src/proxy.js`):
| Path | no token | pending_onboarding | pending_approval | approved |
|---|---|---|---|---|
| `/dashboard/**` | → `/login?next=` | → `/onboarding` | → `/onboarding/waiting-approval` | allow |
| `/onboarding` | → `/login?next=` | allow | → `/onboarding/waiting-approval` | → `/dashboard` |
| `/onboarding/waiting-approval` | → `/login?next=` | → `/onboarding` | allow | → `/dashboard` |
| `/operator` | → `/login?next=` | → `/onboarding` | → `/onboarding/waiting-approval` | → `/dashboard` |

A **platform operator** (backend `is_platform_admin`, status cookie `operator`) is allowed `/operator` only; `/dashboard/**` and
`/onboarding/**` redirect to it. The flag is read by the login route and refreshed by `GET /api/auth/session`, which also repairs a stale
cookie; `dashboard/layout.js` redirects a session that still says "approved". `/forgot-password`, `/reset-password`, `/set-password`,
`/verify-email` and `/login` are public.

## Client state
* **Server state** — TanStack Query (`QueryClient` in `src/app/providers.js`): `staleTime 30 s`, no refetch on window focus,
  **no retry for 4xx**, 2 retries for network/5xx. The session (`["session"]`, 5 min) feeds `useSession()` → user name,
  role and organization used by TopHeader, WelcomeHeader, onboarding navbar and the onboarding form (locked org fields).
* **Notifications** — `NotificationsProvider` (dashboard layout) wraps a query (`refetchInterval 60 s`) with optimistic
  `read` / `read all` mutations (rolled back on error). Hook: `useNotifications()` → `{notifications, unreadCount, handleRead, handleMarkAllRead, isLoading, isError}`.
* **Component state** — filters, pagination, dialogs, multi-step form (`useFieldRecordForm`).
* **sessionStorage** (non-secret only): `registerFormData` (org name/email/phone/region/type — *password fields are stripped*),
  `registrationCompleted`, `onboardingDraft`. **localStorage**: `theme` (landing page), `masar-theme` (workspace and operator:
  `light` \| `dark` \| `system`, `lib/theme.js`) and the sidebar's collapsed flag (`masar-sidebar`). No code, token or password is ever stored.

## Errors & loading
* `ApiError { status, message, fieldErrors, data }` (status `0` = network failure).
* Query failures → `<QueryState>` error banner (`role="alert"`, retry button). Empty → empty state. Loading → skeleton.
* Mutation failures → error toast (global) and/or inline field errors from `fieldErrors`.
* Dialog/forms keep user input on failure; the submit button re-enables.

## Environment
`API_URL` (server only, required — the backend, `http://localhost:4010` in development; must be the same origin as the backend's
`APP_ORIGIN`) · `NEXT_PUBLIC_SUPPORT_EMAIL` (optional) · `NEXT_PUBLIC_API_URL` (legacy fallback for
`API_URL`). See `.env.example`. `NEXT_DIST_DIR` is used only by the E2E build. Backend variables: `backend/README.md`.
