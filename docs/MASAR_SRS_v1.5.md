# Software Requirements Specification (SRS)

**Project Name:** MASAR (مَسَار)
**Methodology:** Agile / Scrum
**Version:** 1.5 — as built
**Date:** November 18, 2026
**Document Owner:** Product Owner / Team Lead
**Supersedes:** v1.4 (June 6, 2026)
**Status:** Reflects the implemented system. The code in this repository is the reference; where this document and the code differ, the code wins and this document is corrected.

---

## Table of Contents

1. Introduction & Product Vision
2. Scrum Roles & Responsibilities
3. User Personas & Roles
4. Functional Requirements (Epics & User Stories)
5. Non-Functional Requirements (NFRs)
6. Delivery Status
7. System Architecture Overview
8. Data Model (High-Level)
9. API Contract (High-Level)
10. Risks & Mitigations
11. Glossary
12. Document Approval
13. Definition of Done (DoD) & Error Handling Guidelines
14. Changes from v1.4

---

## 1. Introduction & Product Vision

### 1.1 Purpose
This document defines the requirements of the MASAR platform as it is implemented. It is the Product Backlog baseline and the reference for the development team. Detailed endpoint contracts live in `docs/api-contracts.md`, the rules the backend enforces in `docs/backend-rules.md`, and the user journeys in `docs/user-journeys.md`.

### 1.2 Product Vision
MASAR is a centralized management platform for humanitarian and community organizations. It replaces scattered spreadsheets with one workspace in which an organization runs its **projects**, and inside every project its requests and approvals, tasks, beneficiaries registry, files and reports, and its monitoring, evaluation, accountability and learning (MEAL) work.

### 1.3 Scope
The system is a **multi-tenant** web platform: many organizations share one deployment, and each organization's data is isolated from the others. It consists of:

- **Organization onboarding and approval:** an organization registers, proves its e-mail address, submits its profile and documents, and is approved, rejected or suspended by a platform operator.
- **People and access control:** employees are invited by e-mail, belong to one of four fixed job categories, and receive a permission package; the system admin can override a role manually (logged).
- **Projects:** every project is a workspace with a team (employees and supervisors). All work lives inside a project.
- **Requests and approvals:** requests with comments, attachments, an activity log, and an approval flow with separation of duties.
- **Tasks:** assignments to team members, optionally generated from a request, with progress tracking.
- **Beneficiaries registry:** per project, with the beneficiary's files and images.
- **Files and reports:** folders, files and stored reports inside projects.
- **MEAL unit:** indicators, field records, complaints and MEAL reports, scoped to projects.
- **Dashboard and notifications.**
- **Organization settings and units:** select-box lists, and switching product units on or off.
- **Platform operator console:** reviewing organizations and platform health.

### 1.4 Out of Scope
These are not part of the product:

- Artificial-intelligence features of any kind (duplicate detection, report generation, chat assistant)
- Volunteer management
- Mobile application and offline mode
- Donor / fundraising management
- Inventory & warehouse management
- Financial accounting modules
- SMS / WhatsApp integration
- Multi-factor authentication
- A language other than Arabic (the interface is Arabic, right-to-left)

### 1.5 Document Conventions
- **SHALL / MUST:** Mandatory requirement.
- **SHOULD:** Recommended requirement.
- **MAY:** Optional requirement.
- **US-X.Y:** User Story identifier (Epic.Story).

---

## 2. Scrum Roles & Responsibilities

| Role | Responsibilities |
|---|---|
| Product Owner / Team Lead | Owns the Product Backlog, defines priorities, ensures the product meets business needs. |
| Scrum Master | Facilitates daily standups, sprint planning, sprint reviews, retrospectives, and removes blockers. |
| Backend Developer | Implements the REST API (Node.js, Fastify, Knex), authentication, authorization, business rules and the database layer. |
| Frontend Developer | Implements the web UI (Next.js, React, Arabic-first RTL) and the Next.js server routes that front the API. |
| API Integration Specialist | Keeps the contract between the Next.js server routes and the backend stable (`docs/api-contracts.md`). |

---

## 3. User Personas & Roles

The system has six kinds of users. Four of them are **job categories**: every employee belongs to exactly one, and the category carries a fixed package of view and edit permissions. An organization does not invent job titles with new permissions.

**👤 Platform Operator**
Staff of the platform itself; belongs to no organization. Reviews organizations that asked to join, approves, rejects (with a reason), suspends or reactivates them, and watches platform-wide figures. Cannot open any organization's business data. Accounts are created from the command line only.

**👤 Organization System Admin**
The person who registered the organization. Holds every permission. Creates projects and builds their teams, invites employees, manages roles, settings and units. Not a job category and never assigned automatically. An organization always keeps at least one active system admin.

**👤 Manager / Project Supervisor (`manager`)**
Oversees projects: sees requests, tasks, employees, roles, files, reports, units, MEAL, projects and beneficiaries; creates and approves requests, creates and updates tasks, uploads files, manages reports, edits beneficiaries.

**👤 MEAL / Field Officer (`meal`)**
Monitoring, evaluation and field work: manages MEAL data, creates requests and tasks, uploads files and images, manages reports, registers and edits beneficiaries.

**👤 Finance Officer (`finance`)**
Creates and approves requests, uploads files, manages reports. Does **not** see beneficiaries' data.

**👤 Employee (`employee`)**
The least-privileged category and the fallback for any job title that matches no other category. Creates requests and uploads files; views requests, tasks, files, reports, units and projects.

### 3.1 Role Permissions Matrix

| Capability | Operator | Admin | Manager | MEAL | Finance | Employee |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Review / approve / reject / suspend organizations | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage employees, roles, settings, units | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create projects and build their teams | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View projects (only those the person works in) | ❌ | ✅ (all) | ✅ | ✅ | ✅ | ✅ |
| View employees and roles | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create a request | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve / reject a request (never one's own) | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |
| View tasks | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create / update tasks | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update status / progress of one's own task | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View files and reports | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Upload files, create folders | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage reports | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| View MEAL | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage MEAL | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| View beneficiaries | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Register / edit beneficiaries | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |

The permission package says **what** a person may do. Project membership says **where**: a person sees a project, and everything inside it, only if they are on its team. Approving or rejecting a request additionally requires the **supervisor** role on that project (or full project access). The backend enforces every rule above; the interface only hides what a person cannot use.

---

## 4. Functional Requirements

### Epic 1: Organization Onboarding & Authentication
**Description:** Registering an organization, proving ownership of its e-mail, signing in, and the platform operator's approval.

#### US-1.1: Register an Organization
As a visitor, I want to register my organization with an admin account, so that I can start using the platform.

**Acceptance Criteria:**
- Form: organization name, organization e-mail, region, phone (≥ 8 characters), admin e-mail, password with confirmation, organization type, agreement to the terms.
- The organization e-mail must not be a free-mail domain (Gmail, Yahoo, Hotmail, Outlook and similar).
- The password is 8–128 characters with at least one digit and one symbol.
- Registration creates the organization in status `incomplete`, its system-admin role, the admin user and default select-box lists. Registration is limited to 10 per 10 minutes per client address.
- Field errors from the server are shown next to the fields.

#### US-1.2: Verify the E-mail with a 6-digit Code
As a new admin, I want to prove I own my e-mail address, so that my account can be activated.

**Acceptance Criteria:**
- A 6-digit one-time code is e-mailed, valid 15 minutes. It is never returned by the API and never stored in the browser.
- The code is stored only as a keyed hash. One active code per user: a new code replaces the previous one.
- At most 5 wrong attempts per code, then the code is dead (`429`) until a new one is requested. Resend: 60-second cooldown and 3 codes per 10 minutes per address.
- Unknown and already-verified addresses answer exactly like a wrong code, so the screen never reveals whether an account exists.

#### US-1.3: Secure Login
As a user, I want to sign in with my e-mail and password.

**Acceptance Criteria:**
- `POST /login` returns an opaque token (valid 30 days). The browser never sees it: the Next.js server stores it in an HttpOnly cookie.
- Wrong e-mail and wrong password give the same `401` response.
- After 5 failures for one e-mail within 15 minutes, further attempts are refused (`429`). A successful login or a password reset clears the counter.
- Account state (e-mail not verified, user inactive, organization suspended or rejected) is revealed only after the password is proven. For a blocked organization the login screen explains why and links to support.
- A session ends at once when the user is deactivated or deleted, changes e-mail, resets the password, or the organization is rejected or suspended.
- Logout revokes the presented token.
- After login the user is redirected by status: onboarding, waiting for approval, dashboard, or the operator console.

#### US-1.4: Recover a Forgotten Password
As a user, I want to reset my password, so that I can regain access.

**Acceptance Criteria:**
- Requesting a reset gives the same answer for every address. A code is e-mailed only to a verified, active user with a password whose organization is not blocked.
- Redeeming the code sets the new password, ends **every** session of that user, lifts the login lockout and e-mails a "password changed" notice.
- At most 5 wrong attempts per code and 10 wrong attempts per hour per address across all codes.
- The three code kinds (verification, invitation, reset) cannot be redeemed as one another.

#### US-1.5: Complete the Organization Profile
As a system admin, I want to submit my organization's profile and documents, so that it can be reviewed.

**Acceptance Criteria:**
- Required: registration number, country, phone, e-mail (not free-mail), contact person. Optional: address, sectors, size, years of experience, notes.
- Documents: PDF, PNG or JPEG, checked by content, up to 5 MB each, 10 per request, 20 per organization. Accepted while the organization is `incomplete` or `pending_approval`.
- Organization name and type are locked after registration.
- Only the system admin may submit, only while `incomplete`. A second submission answers `409`. The status becomes `pending_approval`.

#### US-1.6: Review Organizations (Platform Operator)
As a platform operator, I want to review organizations that asked to join, so that only legitimate ones are admitted.

**Acceptance Criteria:**
- The console lists organizations with search, status filter and pagination, and shows platform-wide figures and system health.
- The review dialog shows the profile, the documents and the state of the admin's e-mail code (never the code).
- Actions: approve (from `pending_approval`, `rejected` or `suspended`), reject with a required reason (from `pending_approval`), suspend (from `approved`). Any other transition answers `409`.
- Approval notifies the organization's members and e-mails its admins. Rejection and suspension e-mail the reason.
- Until the organization is approved, every business endpoint answers `403`.
- The operator can re-send the verification code to an organization's unverified admin.

### Epic 2: People & Access Control
**Description:** Employees, job categories, roles and permissions.

#### US-2.1: Invite an Employee
As a system admin, I want to add an employee, so that they can sign in.

**Acceptance Criteria:**
- Fields: name, e-mail (unique across the platform), phone, department, job title or category, status.
- The new employee has no password. An invitation code is e-mailed, valid 48 hours. The employee types it with a new password on the set-password page, which also verifies the e-mail.
- Only accounts without a password can redeem an invitation. The employees list shows "pending activation" and an admin button to re-send.
- Five wrong guesses kill the invitation until an admin re-sends it.
- Changing an employee's e-mail un-verifies it, ends their sessions and sends a new code (or a new invitation if they have not activated yet).

#### US-2.2: Assign Roles Automatically from the Job Category
As a system admin, I want the role to follow the job title, so that I do not pick permissions by hand.

**Acceptance Criteria:**
- Four fixed categories: `manager`, `meal`, `finance`, `employee`. A title is matched most specific first (finance, then meal, then manager); no match gives `employee`.
- Each category maps to a default role and a package split into view and edit permissions.
- No package holds an administrative permission (`roles.manage`, `settings.manage`, `employees.manage`, `units.manage`, `projects.manage`), and an edit right always comes with the matching view right.
- A role is never auto-assigned if the actor lacks any permission in it, and the system-admin role is never auto-assigned.

#### US-2.3: Override a Role Manually
As a system admin, I want to set a person's role by hand when needed, with a record of it.

**Acceptance Criteria:**
- An explicit role wins and is marked `manual`; a later change of title does not touch it.
- Every automatic assignment and every manual change is written to the audit log with the actor, the previous role and the new one. The employee card shows the history.
- Nobody can grant a permission they do not hold. Non-admins cannot edit more powerful people or roles. Nobody can promote themselves.
- Demoting, deactivating or deleting the last active system admin answers `409`. Nobody can delete or deactivate their own account.

#### US-2.4: Manage Roles
As a system admin, I want to view and edit roles and their permissions.

**Acceptance Criteria:**
- The roles page lists roles with their permissions, using human labels, and lets an authorized user create and edit roles.
- The system-admin role always keeps every permission; only its title can change.

#### US-2.5: Permission-aware Interface
As any user, I want to see only what I am allowed to use.

**Acceptance Criteria:**
- Sidebar entries, buttons and forms are hidden when the person's permissions do not allow them.
- The backend refuses the same actions with `403`, whatever the interface shows.

### Epic 3: Projects
**Description:** A project is the workspace of a team. All work lives inside a project; there is no organization-wide work.

#### US-3.1: Create a Project and Build its Team
As a system admin, I want to create a project and assign its employees and supervisors.

**Acceptance Criteria:**
- Fields: name (unique in the organization), description, status (`active`, `completed`, `archived`), start and end dates. A code `PRJ-001` is generated.
- The team is a list of active employees, each as `supervisor` or `member`. New members are notified.
- The project card shows the counts of members, requests, tasks and beneficiaries.

#### US-3.2: Project Scope
As a team member, I see only my projects.

**Acceptance Criteria:**
- A person who is not on the team gets `404`, as if the project did not exist. Holders of full project access see all projects.
- `project_id` is mandatory on requests, tasks, folders and reports and on every MEAL record. Every file lives in a folder. The select-box list of projects shows the projects the caller works in.

### Epic 4: Requests & Approvals
**Description:** Requests raised inside a project and decided by its supervisors.

#### US-4.1: Create a Request
As a team member, I want to submit a request, so that it can be approved.

**Acceptance Criteria:**
- Fields: project, title, type, priority (`low`, `medium`, `high`, `urgent`), department, amount, description. The request starts `pending` with a code `REQ-001` and a first line in its activity log.
- Those who may decide it are notified: the project's supervisors and people with full project access, never the requester.

#### US-4.2: Comment and Attach
As a team member, I want to discuss a request and attach files to it.

**Acceptance Criteria:**
- Comments and attachments (any type, up to the configured size limit, 10 MB by default, and 20 per request) are available to the project's team. The requester is notified of a new comment.

#### US-4.3: Approve or Reject a Request
As a project supervisor, I want to decide on requests.

**Acceptance Criteria:**
- Needs the approve permission and the supervisor role on the project. A request outside the person's projects answers `404`.
- **Separation of duties:** nobody approves or rejects a request they submitted, whatever their rank (`403`). The interface hides the buttons and says why.
- Only a `pending` request can be decided; a second or concurrent decision answers `409`. Rejection requires a reason.
- The decision is written to the activity log and the requester is notified.

#### US-4.4: Request Lifecycle follows its Tasks
**Acceptance Criteria:**
- After approval the request moves to `in_progress` when its first linked task is created, to `completed` when all linked tasks are done, and back to `in_progress` if a finished task is reopened. Each automatic step is added to the activity log.

### Epic 5: Tasks
**Description:** Assignments to team members.

#### US-5.1: Create and Assign a Task
As a manager or MEAL officer, I want to create a task and assign it to a team member.

**Acceptance Criteria:**
- Fields: title, description, project, assignee, priority, department, type, due date. A code `TSK-001` is generated and the status starts `todo`.
- The assignee must be on the project's team. The assignee is notified.
- A task can be created from an approved request; it copies the request's details and inherits its project.

#### US-5.2: Track a Task
As a team member, I want to update the status and progress of my tasks.

**Acceptance Criteria:**
- Statuses: `todo`, `in_progress`, `blocked`, `done`. Progress is 0–100. Setting `done` sets progress to 100 and records the completion time; reopening clears it.
- The assignee can change only status and progress of their own task. Editing other fields needs the update permission.
- Comments and attachments are available. The creator is notified when someone else completes the task.

### Epic 6: Beneficiaries Registry
**Description:** The register of the people a project serves, kept inside the project.

#### US-6.1: Register and Edit Beneficiaries
As a manager or MEAL officer, I want to register beneficiaries in my project.

**Acceptance Criteria:**
- Fields: full name, national ID, gender, birth date, phone, region, address, household size, notes, status (`active`, `inactive`). A code `BEN-0001` is generated.
- The same national ID twice in one project is refused (`422`). Searching and filtering by status and region are available.
- Only people who are on the team **and** hold the beneficiaries permissions can read or write the registry. Finance and employees cannot.

#### US-6.2: Beneficiary Files
As a MEAL officer, I want to attach documents and images to a beneficiary.

**Acceptance Criteria:**
- Files and images upload to the beneficiary and download with the same access rules as the registry.

### Epic 7: Files & Reports
**Description:** Documents of a project.

#### US-7.1: Folders and Files
**Acceptance Criteria:**
- Folders belong to a project; the same folder name may exist in different projects. Every file is uploaded into a folder (`422` without one). Files follow their folder's reach.
- Anyone allowed to upload can create folders, upload files and images, and download.

#### US-7.2: Stored Reports
**Acceptance Criteria:**
- A report is an uploaded document with a name, type and period, filed in a project and optionally in one of its folders. It can be moved to another folder of the same project.
- The reports page shows the total number of reports, the monthly progress (tasks completed this month against last month) and the active units.

### Epic 8: MEAL Unit
**Description:** Monitoring, evaluation, accountability and learning, scoped to the caller's projects. It works only when the organization has switched the MEAL unit on.

#### US-8.1: Indicators
**Acceptance Criteria:**
- Create an indicator (code, name, project, target, sector, owner), update its achieved value, import from CSV (up to 1000 rows, all-or-nothing) and export to CSV.
- Its status is derived from achieved over target: 100% and above is `achieved`, from 70% `on_track`, from 40% `needs_follow`, below 40% `delayed`.
- Every change of an achieved value is recorded (change, value after, source, user).

#### US-8.2: Field Records
**Acceptance Criteria:**
- A record is a `draft` (may be incomplete, never touches the indicator) or `submitted` (needs project, sector, activity type, date, region, indicator and achieved value). Submitting adds the achieved value to the indicator atomically and counts the beneficiaries reached.
- Evidence: PDF, PNG or JPEG, 5 MB each, up to 10 per record.

#### US-8.3: Complaints
**Acceptance Criteria:**
- Log a complaint (type, project, channel, region, priority, reporter, description). It gets a code `FCRM-900…`, status `new` and an owner.
- Statuses `new`, `in_progress`, `resolved`, `closed`; priorities `low`, `medium`, `high`, `sensitive`. A sensitive complaint alerts the project's other MEAL managers.
- The reporter's name and the description are never returned in lists or exported. Export to CSV.

#### US-8.4: MEAL Reports and Charts
**Acceptance Criteria:**
- Create a report from one of three built-in templates; statuses `draft`, `in_review`, `needs_edit`, `approved`. A report can be downloaded as a printable Arabic HTML page.
- The MEAL dashboard shows statistics, a quarterly chart of actual against target per sector, the distribution of beneficiaries by region, and an activity feed. All figures cover only the caller's projects.

### Epic 9: Dashboard & Notifications
#### US-9.1: Dashboard
**Acceptance Criteria:**
- On login the user sees four figures: active users, open tasks, running operations (approved and in-progress requests), important alerts (own unread notifications), plus weekly activity, active units, pending approvals, recent requests and open tasks. Lists and counters include only what the caller reaches.

#### US-9.2: Notifications
**Acceptance Criteria:**
- Each user has own notifications with an unread counter, mark-as-read and mark-all-read. Nobody is notified about their own action.
- Events: organization approved; request created, approved, rejected or commented; task assigned, completed or commented; sensitive complaint; MEAL report status changed; added to a project team.

### Epic 10: Organization Settings & Units
#### US-10.1: Select-box Lists
**Acceptance Criteria:**
- The system admin edits the lists used by forms: departments, request types, task types, projects, sectors, regions, activity types, complaint types, channels, report types, periods (up to 200 values each).

#### US-10.2: Product Units
**Acceptance Criteria:**
- The catalog has three units: MEAL (with screens), field operations (listed, no screens) and human resources (listed, in development). The admin switches an available unit on or off; a unit in development cannot be switched on.

---

## 5. Non-Functional Requirements (NFRs)

### 5.1 Usability & Localization
- **Arabic-first:** the interface is Arabic with right-to-left layout. English is not supported.
- The interface MUST show loading, empty and error states for every data screen, and keep the user's input when a form submission fails.
- Dates and times are stored in UTC and shown to the user in the interface.

### 5.2 Architecture & Integration
- **Frontend:** Next.js (App Router), React, CSS Modules, TanStack Query.
- **Server routes (BFF):** the browser only ever talks to its own origin (`/api/*`). Next.js route handlers add the `Authorization: Bearer` header from the HttpOnly cookie and relay the response. There is no CORS surface.
- **Backend:** Node.js, Fastify, Knex, Zod validation. The backend is the authority for authentication, permissions and tenant isolation; the route guard in the frontend is a convenience only.
- **Database:** PostgreSQL for production; SQLite for development and tests. The same migrations run on both.
- **Files:** stored on local disk (`UPLOAD_DIR`) under generated keys.

### 5.3 Security
- Passwords hashed with scrypt. Tokens are opaque, 256-bit, and only their SHA-256 is stored.
- The session cookie is HttpOnly, `SameSite=Lax` and `Secure` in production; it is never readable by JavaScript.
- **Tenant isolation:** every business table carries `organization_id`; every query is scoped by the token's organization; another organization's ids answer `404`.
- **Authorization** is enforced by the backend on every endpoint, by permission key and by project membership.
- E-mail codes: CSPRNG, stored as keyed hashes, constant-time comparison, attempt counters in the database, no account enumeration.
- Rate limits per client address and per identity on all public endpoints. The real client address is forwarded by the Next.js server and trusted by the backend only from the configured proxy.
- Uploads: file type decided from content, generated storage keys, download as attachment with `nosniff`, size and count limits.
- Security headers, `Cache-Control: no-store`, request body limit of 1 MiB, secrets redacted from logs.
- Privilege-escalation rules and the audit log of role changes (US-2.3).
- Personal data of beneficiaries is readable only by project team members who hold the beneficiaries permissions.

### 5.4 Quality & Maintainability
- Frontend and backend are separate packages with their own test suites: unit and component tests (Vitest, Testing Library), HTTP end-to-end tests and browser end-to-end tests (Playwright) against the real backend.
- Frontend lint and production build run in CI. The current counts of tests and results are kept in `docs/roadmap-and-issues.md`.
- Every migration is reversible and the up, down, up cycle is tested.

---

## 6. Delivery Status

| Epic | Status |
|---|---|
| 1 Organization onboarding & authentication | Delivered |
| 2 People & access control | Delivered |
| 3 Projects | Delivered |
| 4 Requests & approvals | Delivered |
| 5 Tasks | Delivered |
| 6 Beneficiaries registry | Delivered |
| 7 Files & reports | Delivered |
| 8 MEAL unit | Delivered |
| 9 Dashboard & notifications | Delivered |
| 10 Organization settings & units | Delivered (field operations and HR units are catalog entries without screens) |

### 6.1 Current Limitations
- The MEAL report download is a printable HTML page, not a PDF.
- Files, reports, attachments, folders and MEAL records have no delete endpoints.
- Per-identity rate limits are kept in memory of one process.
- There is no token refresh and no "sign out everywhere" other than a password reset.
- The Terms and Privacy pages contain placeholder text.
- The backend test suite is not part of CI.

---

## 7. System Architecture Overview

```
┌──────────────────────┐
│  Browser (Arabic RTL)│
└──────────┬───────────┘
           │ same-origin  /api/*
           ▼
┌──────────────────────────────┐
│ Next.js server (BFF)         │
│  - proxy.js: route guard     │
│  - /api/* adds Bearer token  │
│    from the HttpOnly cookie  │
└──────────┬───────────────────┘
           │ HTTP + Bearer
           ▼
┌──────────────────────────────┐        ┌──────────────┐
│ Fastify backend (Node.js)    │ ─────▶ │ SMTP server  │
│  auth, organizations,        │        └──────────────┘
│  people, projects, requests, │        ┌──────────────┐
│  tasks, files, reports,      │ ─────▶ │ File storage │
│  meal, units, notifications, │        └──────────────┘
│  platform                    │
└──────────┬───────────────────┘
           ▼
   ┌────────────────┐
   │ PostgreSQL     │  (SQLite in development and tests)
   └────────────────┘
```

### Architecture Rules
1. **The browser never calls the backend.** Only the Next.js server does, with the token from the cookie.
2. **The backend decides.** Authentication, permissions, tenant isolation and project reach are enforced there; the interface only mirrors them.
3. **Everything belongs to a project.** Requests, tasks, beneficiaries, folders, reports and MEAL records carry a mandatory `project_id`.
4. **Permissions come from a catalog in code**, not from a table; roles hold subsets of it.
5. **One code mechanism, three purposes.** Verification, invitation and password reset use the same hashed 6-digit code; the account's state decides which purpose applies.

---

## 8. Data Model (High-Level)

| Entity | Key Fields |
|---|---|
| Organization | id, name, type, email, phone, region, status (`incomplete`, `pending_approval`, `approved`, `rejected`, `suspended`), approved_at, rejection_reason |
| OrganizationProfile | organization_id, registration_number, country, address, contact_person_name, sectors, organization_size, years_of_experience, notes, submitted_at |
| User (employee) | id, organization_id (empty for a platform operator), role_id, name, email, phone, department, job_title, job_category, role_source (`auto` or `manual`), status, is_platform_admin, email_verified_at, last_login_at |
| Role / RolePermission | id, organization_id, title, is_system_admin / role_id, permission_key |
| AuthToken | user_id, token_hash, expires_at, last_used_at |
| AuditLog | organization_id, actor_id, action, entity_type, entity_id, meta, created_at |
| Project | id, organization_id, code, name, description, status, start_date, end_date |
| ProjectMember | project_id, user_id, project_role (`supervisor` or `member`) |
| Request | id, code, project_id, requester_id, title, status, priority, type, department, amount, decided_by, decided_at, rejection_reason |
| RequestComment / RequestActivity | request_id, author or actor, body or text, kind |
| Task | id, code, project_id, request_id, assignee_id, creator_id, title, status, priority, due_date, progress, completed_at |
| TaskComment | task_id, author_id, body |
| Beneficiary | id, code, project_id, full_name, national_id, gender, birth_date, phone, region, address, household_size, status |
| Folder / File | folder: project_id, name / file: folder_id, name, size, mime, storage_key |
| Report | id, project_id, folder_id, name, type, period, storage_key |
| Attachment | attachable_type (request, task, beneficiary, field record, organization), attachable_id, name, size, mime, storage_key |
| Notification | user_id, title, message, type, is_read, link |
| Unit / OrgUnit | unit: key, title, tier, availability / organization_id, unit_id, enabled |
| Option | organization_id, kind, value, label, sort_order |
| Indicator / IndicatorUpdate | project_id, code, name, sector, target, achieved, status / indicator_id, delta, value_after, source |
| FieldRecord | project_id, indicator_id, sector, activity_type, activity_date, region, achieved_value, total_beneficiaries, status |
| Complaint | project_id, code, type, channel, priority, status, owner |
| MealReport / ReportTemplate | project_id, title, type, period, status / name, type, description |

Human-readable codes (`REQ-001`, `TSK-001`, `PRJ-001`, `BEN-0001`, `FCRM-900`) are per-organization sequences.

---

## 9. API Contract (High-Level)

The complete contract, with request and response bodies, is `docs/api-contracts.md`.

| Group | Endpoints | Auth |
|---|---|---|
| Public authentication | `POST /auth/register`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/set-password`, `/auth/forgot-password`, `/auth/reset-password`, `/login` | Public |
| Session & onboarding | `GET /auth/me`, `POST /logout`, `POST /organization/o`, `POST /organization/documents` | Token (allowed before approval) |
| Lookups & overview | `GET /options`, `PUT /options/{kind}`, `GET /dashboard/summary`, `GET /units`, `PATCH /units/{id}`, `/notifications` | Approved member, by permission |
| People | `/employees`, `/employees/{id}/invite`, `/employees/{id}/audit`, `/job-categories`, `/roles`, `/permissions` | By permission |
| Projects | `/projects`, `/projects/{id}`, `PUT /projects/{id}/members`, `/projects/{id}/beneficiaries`, `/beneficiaries/{id}` and its attachments | By permission and project membership |
| Requests | `/requests`, `/requests/{id}`, `/approve`, `/reject`, `/comments`, `/attachments`, `/tasks` | By permission and project membership |
| Tasks | `/tasks`, `/tasks/{id}`, `/comments`, `/attachments` | By permission and project membership |
| Files & reports | `/files/folders`, `/files`, `/reports`, `/reports/summary` | By permission and project membership |
| MEAL | `/meal/stats`, `/charts`, `/activity`, `/indicators`, `/field-records`, `/complaints`, `/reports`, `/report-templates` | MEAL unit on, `meal.view` / `meal.manage` |
| Platform operator | `/platform/stats`, `/platform/organizations`, `…/approve`, `…/reject`, `…/suspend`, `…/resend-verification` | Platform operator |
| Health | `GET /health` | Public |

Lists are paginated (`page`, `per_page`, default 10, maximum 100) and answer `{ data, meta }`.

---

## 10. Risks & Mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | E-mail delivery fails or is misconfigured | Nobody can verify, be invited or reset a password | Production refuses to start without SMTP settings; the operator console shows the state of an admin's code and can re-send it |
| R2 | Brute-forcing 6-digit codes | Account takeover | Five attempts per code, an hourly cap per address, keyed hashes, no enumeration, single-use codes |
| R3 | A user reaches another organization's or another project's data | Data leak | Tenant filter on every query, `404` for foreign ids, project reach checks, tests for each |
| R4 | Arabic / RTL rendering defects | Poor experience for the primary audience | RTL checked on each screen and covered by browser tests |
| R5 | Personal data of beneficiaries | Privacy and compliance risk | Project-scoped registry, dedicated permissions, no sensitive complaint details in lists or exports, audit of role changes |
| R6 | Running several backend instances | Per-process rate limits are not shared | Documented; a shared store is needed before scaling out |
| R7 | Files kept on local disk | Loss or inconsistency across servers | Persistent storage must be mounted in production |

---

## 11. Glossary

| Term | Definition |
|---|---|
| MASAR | The platform's name (مَسَار) |
| Tenant / Organization | One organization using the platform; its data is isolated from all others |
| Platform Operator | Staff of the platform itself, with no organization, who approves organizations |
| System Admin | The organization's administrator; holds every permission |
| Job Category | One of four fixed categories (`manager`, `meal`, `finance`, `employee`) that determine an employee's permission package |
| Project | A workspace with a team; all work lives inside it |
| Supervisor | A team member who may decide on the project's requests |
| Separation of Duties | Nobody decides a request they submitted |
| MEAL | Monitoring, Evaluation, Accountability and Learning |
| BFF | Backend for frontend: the Next.js server routes between the browser and the API |
| OTP / code | A 6-digit one-time code sent by e-mail |
| RBAC | Role-Based Access Control |
| RTL | Right-to-left text direction |
| NGO | Non-Governmental Organization |

---

## 12. Document Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Product Owner | | | |
| Scrum Master | | | |
| Tech Lead (Backend) | | | |
| Tech Lead (Frontend) | | | |

---

## 13. Definition of Done (DoD) & Error Handling Guidelines

- **Definition of Done for a user story:** (1) peer code review completed; (2) no credentials or secrets in the repository; (3) automated tests for the change pass, including the rule that the backend enforces what the interface hides; (4) Arabic RTL alignment verified on standard screen sizes; (5) the contract documents (`docs/api-contracts.md`, `docs/backend-rules.md`) updated when behaviour changes.
- **Error responses:** every API error is a JSON body with an Arabic `message`. Validation errors (`422`) add `errors` keyed by field. Status codes: `401` unauthenticated, `403` forbidden, `404` unknown or foreign id, `409` state conflict, `413` too large, `429` rate limited, `400` malformed JSON, `500` generic.
- **Interface:** query failures show an error banner with retry; empty results show an empty state; a failed submission keeps the user's input and shows field errors next to the fields; an unexpected render failure shows an Arabic error screen while the dashboard shell stays usable.

---

## 14. Changes from v1.4

| Area | v1.4 | v1.5 (as built) |
|---|---|---|
| Tenancy | Single organization per deployment | Multi-tenant with a platform operator who approves organizations |
| Backend | Laravel, Spatie RBAC, JWT | Node.js, Fastify, Knex; permission catalog in code; opaque tokens in an HttpOnly cookie behind a Next.js BFF |
| AI service | FastAPI + Claude: duplicate detection, monthly report | Removed from the product |
| Volunteers | Independent module with a feature flag | Removed |
| Mobile | Flutter app, offline-first | Removed |
| Roles | Three personas (Admin, Staff, Coordinator) with dynamic RBAC | Operator, System Admin and four fixed job categories with permission packages |
| Organizing unit of work | None | Projects are mandatory workspaces with teams and supervisors |
| Approvals | Not specified | Requests with approval and separation of duties |
| Beneficiaries | Core module with AI duplicate detection and blind-indexed national ID | A registry inside each project; the same national ID twice in one project is refused |
| MEAL | Not specified | Indicators, field records, complaints, reports and charts |
| Tasks | Kanban with three statuses | Four statuses (`todo`, `in_progress`, `blocked`, `done`) with progress and optional link to a request |
| Authentication | Email and password, lock after 5 failures | Adds e-mail verification, employee invitation and password reset by 6-digit codes |
| Reports | AI-generated monthly narrative | Stored documents plus MEAL reports as printable HTML |
| Audit log | CRUD actions on beneficiaries and users | Role assignments and changes |
| Release plan | June sprints, MVP demo | Replaced by section 6, Delivery Status |
| Language | Arabic first, English secondary | Arabic only |

---

*End of Document — MASAR SRS v1.5*
