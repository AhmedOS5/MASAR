// Mock Laravel backend used ONLY for end-to-end verification (npm run e2e) and local demos.
// It implements the API contract documented in docs/api-contracts.md with in-memory state:
// auth (Bearer), validation (422), pagination meta, state changes, multipart uploads/downloads.
// Test controls:  POST /__control/fail {method,path,status,message,times}  |  GET /__control/log  |  POST /__control/reset
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4010);
const ORIGIN = process.env.MOCK_ORIGIN || `http://localhost:${PORT}`;

let S; // state
let LOG;
let FAILS;

function reset() {
  LOG = [];
  FAILS = [];
  const org = { name: "منظمة النور", type: "ngo", email: "info@alnoor.org", phone: "+970 59 111 2222" };
  S = {
    seq: 100,
    verified: new Set(["admin@org.org", "pending@org.org", "new@org.org", "ops@masar.io"]),
    users: {
      "admin@org.org": { password: "Passw0rd!", token: "tok_admin", name: "ليلى المحمود", role: "مديرة النظام", status: "approved", org },
      "pending@org.org": { password: "Passw0rd!", token: "tok_pending", name: "سامر", role: "مدير", status: "pending_approval", org },
      "new@org.org": { password: "Passw0rd!", token: "tok_new", name: "نورا", role: "مديرة", status: "incomplete", org: { name: "مؤسسة جديدة", type: "gov", email: "new@new.org", phone: "" } },
      // platform operator: staff of the platform itself, no organization
      "ops@masar.io": { password: "Passw0rd!", token: "tok_ops", name: "فريق مسار", role: "مشرف المنصة", status: "approved", org: null, is_platform_admin: true },
    },
    registrations: [],
    otp: {}, // e-mail -> { attempts } for the 6-digit verification code
    invites: {}, // e-mail -> { attempts, employeeId } for the employee invitation code
    resets: {}, // e-mail -> { attempts } for the password reset code
    mail: [], // outgoing e-mails (GET /__control/mail)
    onboarding: [],
    departments: ["العمليات", "المالية", "الموارد البشرية"],
    employees: [
      { id: 1, name: "جلال العمر", email: "jalal@org.org", phone: "", role: { id: 1, title: "باحث ميداني" }, department: "العمليات", status: "active" },
      { id: 2, name: "منى سالم", email: "mona@org.org", phone: "", role: { id: 2, title: "مدير عمليات" }, department: "المالية", status: "inactive" },
    ],
    roles: [
      { id: 1, title: "باحث ميداني", users_count: 1, is_system_admin: false, permissions: ["tasks.view"] },
      { id: 2, title: "مدير عمليات", users_count: 1, is_system_admin: false, permissions: ["tasks.view", "reports.view"] },
    ],
    permissions: [
      { key: "tasks.view", label: "عرض المهام" },
      { key: "reports.view", label: "عرض التقارير" },
      { key: "files.upload", label: "رفع الملفات" },
    ],
    // A project is mandatory: every request, task, folder and file lives in one (same two projects as the backend demo seed).
    projects: [
      { id: 1, code: "PRJ-001", name: "مشروع ألف", status: "active", members: [{ user_id: 1, name: "جلال العمر", project_role: "member" }] },
      { id: 2, code: "PRJ-002", name: "مشروع باء", status: "active", members: [{ user_id: 1, name: "جلال العمر", project_role: "member" }] },
    ],
    requests: Array.from({ length: 23 }, (_, i) => ({
      id: `R-${i + 1}`,
      code: `REQ-${String(i + 1).padStart(3, "0")}`,
      title: `طلب اختبار رقم ${i + 1}`,
      status: ["pending", "approved", "in_progress", "completed", "rejected", "draft"][i % 6],
      priority: ["low", "medium", "high", "urgent"][i % 4],
      type: i % 2 ? "مشتريات" : "لوجستيات",
      department: S_DEPT(i),
      description: `وصف الطلب ${i + 1}`,
      amount: 1000 + i * 100,
      project_id: (i % 2) + 1,
      project: { id: (i % 2) + 1, name: ["مشروع ألف", "مشروع باء"][i % 2] },
      requester: { id: 1, name: "جلال العمر" }, // submitted by the researcher, so the admin may decide them (separation of duties)
      created_at: new Date(Date.UTC(2026, 2, 1 + (i % 28))).toISOString(),
      comments: [],
      attachments: [],
      activities: [{ id: 1, text: "تم إنشاء الطلب", kind: "created", created_at: new Date().toISOString() }],
    })),
    tasks: Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      code: `TSK-${String(i + 1).padStart(3, "0")}`,
      title: `مهمة اختبار رقم ${i + 1}`,
      description: `وصف المهمة ${i + 1}`,
      status: ["todo", "in_progress", "blocked", "done"][i % 4],
      priority: ["low", "medium", "high", "urgent"][i % 4],
      department: S_DEPT(i),
      type: "تدريب",
      assignee: { id: 1, name: "جلال العمر", role: "باحث ميداني" },
      assignee_id: 1,
      project_id: (i % 2) + 1,
      project: { id: (i % 2) + 1, name: ["مشروع ألف", "مشروع باء"][i % 2] },
      creator: { name: "ليلى المحمود" },
      due_date: "2026-07-02",
      progress: (i % 4) * 25,
      request: i === 0 ? { id: "R-1", code: "REQ-001", title: "طلب اختبار رقم 1" } : null,
      created_at: new Date(Date.UTC(2026, 2, 1 + i)).toISOString(),
      comments: [],
      attachments: [],
    })),
    files: [
      { id: 1, name: "تقرير.pdf", size: 2048, mime: "application/pdf", folder_id: 1, created_at: "2026-02-01T00:00:00Z", content: "%PDF-mock-1" },
      { id: 2, name: "جدول.xlsx", size: 1024, mime: "application/vnd.ms-excel", folder_id: 2, created_at: "2026-02-02T00:00:00Z", content: "xlsx-mock" },
    ],
    folders: [{ id: 1, name: "التقارير الميدانية", project_id: 1 }, { id: 2, name: "الوثائق الرسمية", project_id: 1 }],
    notifications: [
      { id: 1, title: "تقرير جديد", message: "m", type: "system", is_read: false, created_at: new Date().toISOString() },
      { id: 2, title: "مهمة بانتظارك", message: "m", type: "task", is_read: false, created_at: new Date().toISOString(), link: "/dashboard/tasks/1" },
      { id: 3, title: "تنبيه", message: "m", type: "alert", is_read: true, created_at: new Date().toISOString() },
    ],
    units: [
      { id: 1, title: "المتابعة والتقييم", description: "d", status: "active", tier: "core", roles_count: 12, screens_count: 6, manager_roles: "مدير", icon: "bar-chart", href: "/dashboard/meal" },
      { id: 2, title: "العمليات الميدانية", description: "d", status: "inactive", tier: "core", roles_count: 8, screens_count: 4, manager_roles: "مشرف", icon: "map-pin" },
      { id: 3, title: "الموارد البشرية", description: "d", status: "in_development", tier: "optional", roles_count: 5, screens_count: 3, manager_roles: "—", icon: "users" },
    ],
    complaints: Array.from({ length: 14 }, (_, i) => ({
      id: i + 1,
      code: `FCRM-${900 + i}`,
      type: "تأخير توزيع",
      project_id: (i % 2) + 1,
      project: ["مشروع ألف", "مشروع باء"][i % 2],
      region: ["غزة", "الضفة"][i % 2],
      channel: "الهاتف",
      priority: ["low", "medium", "high", "sensitive"][i % 4],
      status: ["new", "in_progress", "resolved", "closed"][(i + 1) % 4],
      owner: { name: "هالة" },
      received_at: "2026-02-02",
    })),
    indicators: Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      code: `IND-${i + 1}.1`,
      name: `مؤشر ${i + 1}`,
      project_id: (i % 2) + 1,
      project: ["مشروع ألف", "مشروع باء"][i % 2],
      sector: ["المياه", "الصحة"][i % 2],
      target: 100 * (i + 1),
      achieved: 50 * (i + 1),
      status: ["on_track", "needs_follow", "delayed", "achieved"][i % 4],
      updated_at: new Date().toISOString(),
      owner: { name: "سلمى" },
    })),
    mealReports: Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      title: `تقرير ميل ${i + 1}`,
      type: "تقرير متابعة",
      project_id: 1,
      project: "مشروع ألف",
      period: "Q1 2026",
      status: ["draft", "in_review", "needs_edit", "approved", "approved"][i],
      owner: { name: "داليا" },
      updated_at: new Date().toISOString(),
    })),
    // Platform console data (/platform/*): organizations in every state, so the operator console has something to review.
    platformOrgs: [
      { id: 1, name: "منظمة النور", type: "ngo", email: "info@alnoor.org", phone: "+970 59 111 2222", region: "رام الله", status: "approved", employees_count: 24, beneficiaries_reached: 1250, created_at: "2026-01-10T08:00:00.000Z", admin: { name: "ليلى المحمود", email: "admin@org.org" } },
      { id: 2, name: "جمعية الأمل", type: "ngo", email: "contact@alamal.org", phone: "+970 59 222 3333", region: "نابلس", status: "pending_approval", employees_count: 3, beneficiaries_reached: 0, created_at: "2026-03-02T08:00:00.000Z", admin: { name: "سامر خليل", email: "pending@org.org" } },
      { id: 3, name: "مؤسسة الغد", type: "gov", email: "info@alghad.org", phone: "", region: "غزة", status: "suspended", employees_count: 8, beneficiaries_reached: 310, created_at: "2025-11-20T08:00:00.000Z", admin: { name: "هدى ناصر", email: "huda@alghad.org" }, rejection_reason: "مخالفة شروط الاستخدام" },
      { id: 4, name: "مؤسسة جديدة", type: "gov", email: "new@new.org", phone: "", region: "الخليل", status: "incomplete", employees_count: 1, beneficiaries_reached: 0, created_at: "2026-04-01T08:00:00.000Z", admin: { name: "نورا", email: "new@org.org" } },
    ],
    fieldRecords: [],
    reports: [{ id: 1, name: "تقرير مالي", type: "مالي", period: "مايو 2026" }],
  };
}
function S_DEPT(i) {
  return ["العمليات", "المالية", "الموارد البشرية"][i % 3];
}
reset();

// ----------------------------------------------------------------- helpers
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const err422 = (res, errors, message = "The given data was invalid.") => send(res, 422, { message, errors });
const nextId = () => ++S.seq;
const paginate = (arr, q) => {
  const per = Number(q.get("per_page") || 10);
  const page = Number(q.get("page") || 1);
  return {
    data: arr.slice((page - 1) * per, page * per),
    meta: { total: arr.length, current_page: page, last_page: Math.max(1, Math.ceil(arr.length / per)) },
  };
};
const countBy = (arr, key) => arr.reduce((a, r) => ((a[r[key]] = (a[r[key]] || 0) + 1), a), {});
const filterBy = (arr, q, keys, searchKeys) =>
  arr.filter((r) => {
    for (const [param, field] of keys) {
      const v = q.get(param);
      if (v && v !== "all" && String(r[field] ?? r[field + "_id"]) !== v) return false;
    }
    const s = q.get("search");
    if (s && !searchKeys.some((k) => String(r[k] ?? "").includes(s))) return false;
    return true;
  });

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const buf = Buffer.concat(chunks);
  const ct = req.headers["content-type"] || "";
  if (!buf.length) return {};
  if (ct.includes("application/json")) return JSON.parse(buf.toString("utf8"));
  if (ct.includes("multipart/form-data")) {
    const fd = await new Response(buf, { headers: { "content-type": ct } }).formData();
    const out = { __files: [] };
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string") out[k] = v;
      else out.__files.push({ field: k, name: v.name, size: v.size, mime: v.type, content: Buffer.from(await v.arrayBuffer()).toString("utf8") });
    }
    return out;
  }
  return {};
}

const userFromToken = (req) => {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) return null;
  return Object.entries(S.users).find(([, u]) => u.token === m[1])?.[0] ?? null;
};
const userId = (email) => 1000 + Object.keys(S.users).indexOf(email);
const publicUser = (email) => {
  const u = S.users[email];
  return { id: userId(email), name: u.name, email, role: u.role, organization_name: u.org?.name, onboarding_status: u.status, is_platform_admin: Boolean(u.is_platform_admin) };
};

// ------------------------------------------------------------------ routes
const routes = [];
const on = (method, pattern, handler, { auth = true } = {}) =>
  routes.push({ method, re: new RegExp(`^${pattern}$`), handler, auth });

// --- public: registration & e-mail verification
// E-mail verification is a 6-digit code. The mock accepts one fixed code (MOCK_OTP) but mimics the real backend's rules:
// 5 wrong attempts per code, then 429 until a new code is requested; unknown/verified e-mails behave like wrong codes.
const MOCK_OTP = "123456";
const MAX_OTP_ATTEMPTS = 5;
const otpMail = (email) =>
  S.mail.push({ to: email, subject: "رمز التحقق من بريدك الإلكتروني - مسار", text: `رمز التحقق الخاص بك هو:\n\n${MOCK_OTP}\n\nينتهي هذا الرمز خلال 15 دقيقة.` });
const registerOrganization = async ({ res, body }) => {
  const errors = {};
  for (const f of ["organization_name", "organization_email", "admin_email", "organization_region", "organization_phone", "admin_password"]) {
    if (!body[f]) errors[f] = ["الحقل مطلوب"];
  }
  if (body.admin_password !== body.admin_password_confirmation) errors.admin_password = ["كلمتا المرور غير متطابقتين"];
  if (!body.agreed_to_terms) errors.agreed_to_terms = ["يجب الموافقة على الشروط"];
  if (S.users[body.admin_email]) errors.admin_email = ["هذا البريد مستخدم مسبقاً"];
  if (Object.keys(errors).length) return err422(res, errors);
  S.registrations.push(body);
  S.users[body.admin_email] = {
    password: body.admin_password,
    token: `tok_${nextId()}`,
    name: body.admin_email.split("@")[0],
    role: "مدير",
    status: "incomplete",
    org: { name: body.organization_name, type: body.organization_type, email: body.organization_email, phone: body.organization_phone },
  };
  S.otp[body.admin_email] = { attempts: 0 };
  otpMail(body.admin_email);
  send(res, 201, { message: "تم إنشاء الحساب. أرسلنا رمز التحقق المكوّن من 6 أرقام إلى بريدك الإلكتروني.", expires_in_minutes: 15 });
};
on("POST", "/auth/register", registerOrganization, { auth: false });
on("POST", "/register-organization", registerOrganization, { auth: false }); // alias, as in the real backend

on("POST", "/auth/verify-email", ({ res, body }) => {
  const email = String(body.email ?? "").trim().toLowerCase();
  const code = String(body.code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return err422(res, { code: ["الرمز يتكون من 6 أرقام."] });
  const invalid = () => err422(res, { code: ["الرمز غير صحيح أو منتهي الصلاحية."] }, "الرمز غير صحيح أو منتهي الصلاحية.");
  const locked = () => send(res, 429, { message: "تجاوزت عدد المحاولات المسموح بها. اطلب رمزاً جديداً." });
  const st = (S.otp[email] ??= { attempts: 0, ghost: true });
  if (st.attempts >= MAX_OTP_ATTEMPTS) return locked();
  const active = !st.ghost && !S.verified.has(email) && S.users[email];
  st.attempts += 1;
  if (active && code === MOCK_OTP) {
    S.verified.add(email);
    delete S.otp[email];
    return send(res, 200, { verified: true, message: "تم تفعيل البريد بنجاح." });
  }
  return invalid();
}, { auth: false });

on("POST", "/auth/resend-verification", ({ res, body }) => {
  const email = String(body.email ?? "").trim().toLowerCase();
  if (S.verified.has(email)) return send(res, 400, { message: "البريد الإلكتروني مفعّل مسبقاً." });
  if (S.users[email]) {
    S.otp[email] = { attempts: 0 }; // a new code invalidates the old one and resets the attempts
    otpMail(email);
  }
  send(res, 200, { message: "إذا كان البريد مسجلاً فسيصلك رمز تحقق جديد خلال لحظات.", expires_in_minutes: 15, resend_after_seconds: 0 });
}, { auth: false });

// --- employee invitation (see docs/api-contracts.md): the mock accepts the same fixed code and mimics the rules (5 attempts, 429)
const inviteMail = (email) =>
  S.mail.push({ to: email, subject: "دعوة للانضمام إلى منظمة النور - مسار", text: `تمت إضافتك إلى منظمة النور. رمز التفعيل الخاص بك هو:\n\n${MOCK_OTP}\n\nينتهي هذا الرمز خلال يومين.` });
const issueInvite = (e) => {
  S.invites[e.email] = { attempts: 0, employeeId: e.id };
  inviteMail(e.email);
};
on("POST", "/auth/set-password", ({ res, body }) => {
  const email = String(body.email ?? "").trim().toLowerCase();
  const code = String(body.code ?? "").replace(/\s+/g, "");
  const password = String(body.password ?? "");
  const errors = {};
  if (!/^\d{6}$/.test(code)) errors.code = ["الرمز يتكون من 6 أرقام."];
  if (password.length < 8 || !/[0-9]/.test(password) || !/[^\p{L}\p{N}\s]/u.test(password)) errors.password = ["كلمة المرور لا تستوفي الشروط."];
  else if (password !== body.password_confirmation) errors.password = ["كلمتا المرور غير متطابقتين."];
  if (Object.keys(errors).length) return err422(res, errors);
  const invalid = () => err422(res, { code: ["الرمز غير صحيح أو منتهي الصلاحية."] }, "الرمز غير صحيح أو منتهي الصلاحية.");
  const st = (S.invites[email] ??= { attempts: 0, ghost: true });
  if (st.attempts >= MAX_OTP_ATTEMPTS) return send(res, 429, { message: "تجاوزت عدد المحاولات المسموح بها. اطلب رمزاً جديداً." });
  st.attempts += 1;
  const emp = !st.ghost && S.employees.find((x) => x.id === st.employeeId);
  if (!emp || !emp.invite_pending || code !== MOCK_OTP) return invalid();
  emp.invite_pending = false;
  delete S.invites[email];
  S.verified.add(email);
  S.users[email] = { password, token: `tok_${nextId()}`, name: emp.name, role: emp.role?.title ?? "عضو", status: "approved", org: S.users["admin@org.org"].org };
  send(res, 200, { activated: true, message: "تم تفعيل حسابك. يمكنك الآن تسجيل الدخول." });
}, { auth: false });

// --- forgot password (see docs/api-contracts.md): the same fixed code, the same rules as the real backend (5 attempts, 429,
// the same answer for every address, every session ended by a successful reset)
on("POST", "/auth/forgot-password", ({ res, body }) => {
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err422(res, { email: ["بريد إلكتروني غير صالح."] });
  if (S.users[email] && S.verified.has(email)) {
    S.resets[email] = { attempts: 0 };
    S.mail.push({ to: email, subject: "رمز إعادة تعيين كلمة المرور - مسار", text: `رمز إعادة التعيين الخاص بك هو:\n\n${MOCK_OTP}\n\nينتهي هذا الرمز خلال 15 دقيقة.` });
  } else {
    delete S.resets[email]; // an unknown address gets fresh attempts too
  }
  send(res, 200, { message: "إذا كان البريد مسجلاً فسيصلك رمز إعادة تعيين كلمة المرور خلال لحظات.", expires_in_minutes: 15, resend_after_seconds: 0 });
}, { auth: false });

on("POST", "/auth/reset-password", ({ res, body }) => {
  const email = String(body.email ?? "").trim().toLowerCase();
  const code = String(body.code ?? "").replace(/\s+/g, "");
  const password = String(body.password ?? "");
  const errors = {};
  if (!/^\d{6}$/.test(code)) errors.code = ["الرمز يتكون من 6 أرقام."];
  if (password.length < 8 || !/[0-9]/.test(password) || !/[^\p{L}\p{N}\s]/u.test(password)) errors.password = ["كلمة المرور لا تستوفي الشروط."];
  else if (password !== body.password_confirmation) errors.password = ["كلمتا المرور غير متطابقتين."];
  if (Object.keys(errors).length) return err422(res, errors);
  const invalid = () => err422(res, { code: ["الرمز غير صحيح أو منتهي الصلاحية."] }, "الرمز غير صحيح أو منتهي الصلاحية.");
  const st = (S.resets[email] ??= { attempts: 0, ghost: true });
  if (st.attempts >= MAX_OTP_ATTEMPTS) return send(res, 429, { message: "تجاوزت عدد المحاولات المسموح بها. اطلب رمزاً جديداً." });
  st.attempts += 1;
  const user = !st.ghost && S.users[email];
  if (!user || code !== MOCK_OTP) return invalid();
  delete S.resets[email];
  user.password = password;
  user.token = `tok_${nextId()}`; // every session of the user ends
  S.mail.push({ to: email, subject: "تم تغيير كلمة مرور حسابك - مسار", text: "تم تغيير كلمة المرور الخاصة بحسابك، وتم إنهاء جميع جلسات الدخول السابقة." });
  send(res, 200, { reset: true, message: "تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة." });
}, { auth: false });

// --- auth
on("POST", "/login", ({ res, body }) => {
  const u = S.users[body.admin_email];
  if (!u || u.password !== body.admin_password) return send(res, 401, { message: "بيانات الدخول غير صحيحة" });
  if (!S.verified.has(body.admin_email)) return send(res, 403, { message: "يرجى تفعيل البريد الإلكتروني أولاً" });
  send(res, 200, { token: u.token, user: { name: u.name, email: body.admin_email, role: u.role, onboarding_status: u.status, is_platform_admin: Boolean(u.is_platform_admin) } });
}, { auth: false });
on("GET", "/auth/me", ({ res, email }) => send(res, 200, { user: publicUser(email), organization: S.users[email].org }));
on("POST", "/logout", ({ res }) => send(res, 200, { ok: true }));

// --- platform operator console (platform admins only; the real backend answers 403 to everyone else)
const platformOnly = (handler) => (ctx) =>
  S.users[ctx.email]?.is_platform_admin ? handler(ctx) : send(ctx.res, 403, { message: "هذه الصلاحية لمشغّلي المنصة فقط." });
const ORG_STATES = ["incomplete", "pending_approval", "approved", "rejected", "suspended"];
const orgById = (id) => S.platformOrgs.find((o) => String(o.id) === String(id));
on("GET", "/platform/stats", platformOnly(({ res }) => {
  const by_status = Object.fromEntries(ORG_STATES.map((s) => [s, S.platformOrgs.filter((o) => o.status === s).length]));
  const employees = S.platformOrgs.reduce((n, o) => n + o.employees_count, 0);
  send(res, 200, { data: {
    organizations: { total: S.platformOrgs.length, by_status },
    employees: { total: employees, active: employees },
    beneficiaries_reached: S.platformOrgs.reduce((n, o) => n + o.beneficiaries_reached, 0),
    health: { status: "ok", database: "ok", uptime_seconds: 3600, checked_at: new Date().toISOString() },
  } });
}));
on("GET", "/platform/organizations", platformOnly(({ res, q }) =>
  send(res, 200, paginate(filterBy([...S.platformOrgs].reverse(), q, [["status", "status"]], ["name", "email"]), q))));
on("GET", "/platform/organizations/(\\d+)", platformOnly(({ res, m }) => {
  const o = orgById(m[1]);
  if (!o) return send(res, 404, { message: "المنظمة غير موجودة." });
  send(res, 200, { data: {
    ...o,
    admin_accounts: [{
      id: 10 + o.id, name: o.admin.name, email: o.admin.email, status: "active", verified: o.status !== "incomplete", verified_at: null,
      has_password: true, last_login_at: null,
      code: { active: o.status === "incomplete", kind: "verification", sent_at: null, expires_at: null, attempts: 0 },
    }],
    profile: { registration_number: `REG-${o.id}`, country: "فلسطين", address: o.region, contact_person_name: o.admin.name, sectors: ["education"], organization_size: "small", years_of_experience: 3, notes: null },
    documents: [{ id: 1, name: "رخصة التسجيل.pdf", size: 2048, mime: "application/pdf", created_at: o.created_at }],
  } });
}));
const decide = (from, to) => platformOnly(({ res, m, body }) => {
  const o = orgById(m[1]);
  if (!o) return send(res, 404, { message: "المنظمة غير موجودة." });
  if (!from.includes(o.status)) return send(res, 409, { message: `لا يمكن تنفيذ الإجراء على منظمة حالتها «${o.status}».` });
  o.status = to;
  o.rejection_reason = body.reason ?? null;
  send(res, 200, { data: o });
});
on("POST", "/platform/organizations/(\\d+)/approve", decide(["pending_approval", "suspended", "rejected"], "approved"));
on("POST", "/platform/organizations/(\\d+)/reject", decide(["pending_approval"], "rejected"));
on("POST", "/platform/organizations/(\\d+)/suspend", decide(["approved"], "suspended"));
on("POST", "/platform/organizations/(\\d+)/resend-verification", platformOnly(({ res, m }) => {
  const o = orgById(m[1]);
  if (!o) return send(res, 404, { message: "المنظمة غير موجودة." });
  if (o.status !== "incomplete") return send(res, 409, { message: "حساب المدير مفعّل بالفعل." });
  otpMail(o.admin.email);
  send(res, 200, { data: o });
}));

// --- onboarding
on("POST", "/organization/o", ({ res, body, email }) => {
  const errors = {};
  for (const f of ["organization_name", "organization_type", "registration_number", "phone", "email", "contact_person_name"]) if (!body[f]) errors[f] = ["الحقل مطلوب"];
  if (Object.keys(errors).length) return err422(res, errors);
  S.onboarding.push({ by: email, ...body });
  S.users[email].status = "pending_approval";
  send(res, 201, { ok: true });
});
on("POST", "/organization/documents", ({ res, body }) => send(res, 201, { stored: body.__files.length }));

// --- lookups & dashboard
on("GET", "/options", ({ res }) =>
  send(res, 200, {
    data: {
      departments: S.departments,
      request_types: ["مشتريات", "لوجستيات"],
      task_types: ["تدريب", "متابعة"],
      projects: ["مشروع ألف", "مشروع باء"],
      sectors: ["المياه", "الصحة"],
      regions: ["غزة", "الضفة", "القدس"],
      activity_types: ["توزيع مساعدات", "جلسة تدريب"],
      complaint_types: ["تأخير توزيع", "نقص مواد"],
      channels: ["الهاتف", "نموذج إلكتروني"],
      report_types: ["مالي", "تقرير متابعة"],
      periods: ["Q1 2026", "Q2 2026"],
      employees: S.employees.map((e) => ({ value: e.id, label: e.name })),
    },
  }));
on("GET", "/dashboard/summary", ({ res }) => {
  const openTasks = S.tasks.filter((t) => t.status !== "done");
  send(res, 200, {
    data: {
      stats: {
        active_users: { value: S.employees.filter((e) => e.status === "active").length + 90, trend_text: "+4% جديد", trend: "up" },
        open_tasks: { value: openTasks.length + 70, trend_text: "+22% هذا الأسبوع", trend: "up" },
        running_operations: { value: 12, trend_text: "مستقر", trend: "neutral" },
        important_alerts: { value: S.notifications.filter((n) => !n.is_read).length, trend_text: "تتطلب إجراء", trend: "down" },
      },
      weekly_activity: ["2026-03-01", "2026-03-02", "2026-03-03"].map((date, i) => ({ date, requests: 3 + i, tasks: 2 * i })),
      active_units: S.units.filter((u) => u.status === "active").map((u) => ({ id: u.id, title: u.title, icon: u.icon })),
      pending_approvals: S.requests.filter((r) => r.status === "pending").slice(0, 3).map((r) => ({ id: r.id, title: r.title, amount: r.amount, department: r.department, created_at: r.created_at })),
      recent_requests: S.requests.slice(0, 4),
      open_tasks: openTasks.slice(0, 3).map((t) => ({ id: t.id, code: t.code, title: t.title, status: t.status, assignee: t.assignee.name, due_date: t.due_date })),
    },
  });
});

// --- units / notifications
on("GET", "/units", ({ res }) => send(res, 200, { data: S.units }));
on("PATCH", "/units/(\\d+)", ({ res, m, body }) => {
  const u = S.units.find((x) => x.id === Number(m[1]));
  if (!u) return send(res, 404, { message: "الوحدة غير موجودة" });
  if (u.status === "in_development") return send(res, 422, { message: "الوحدة قيد التطوير" });
  u.status = body.enabled ? "active" : "inactive";
  send(res, 200, { data: u });
});
on("GET", "/notifications", ({ res }) => send(res, 200, { data: S.notifications }));
on("PATCH", "/notifications/(\\d+)/read", ({ res, m }) => {
  const n = S.notifications.find((x) => x.id === Number(m[1]));
  if (n) n.is_read = true;
  send(res, 200, { ok: true });
});
on("POST", "/notifications/read-all", ({ res }) => {
  S.notifications.forEach((n) => (n.is_read = true));
  send(res, 200, { ok: true });
});

// --- projects (the lists a person can put work into, and a project's team)
const P = (id) => S.projects.find((p) => p.id === Number(id));
const projectRef = (body, errors) => {
  const p = body.project_id == null || body.project_id === "" ? null : P(body.project_id);
  if (!p) errors.project_id = [body.project_id == null || body.project_id === "" ? "الحقل مطلوب." : "المشروع المحدد غير موجود أو لا تملك الوصول إليه."];
  return p;
};
/** MEAL rows: the mandatory project as { project_id, project (name) }. */
const mealProject = (body, errors) => {
  const p = projectRef(body, errors);
  return p ? { project_id: p.id, project: p.name } : {};
};
on("GET", "/projects", ({ res, q }) => {
  const items = S.projects.filter((p) => !q.get("status") || p.status === q.get("status")).map(({ members, ...p }) => ({ ...p, members_count: members.length }));
  send(res, 200, { data: items, meta: { total: items.length } });
});
on("GET", "/projects/(\\d+)", ({ res, m }) => (P(m[1]) ? send(res, 200, { data: P(m[1]) }) : send(res, 404, { message: "المشروع غير موجود." })));

// --- requests
const R = (id) => S.requests.find((r) => r.id === id);
on("GET", "/requests", ({ res, q }) => {
  const all = filterBy(S.requests, q, [["status", "status"], ["priority", "priority"]], ["title", "code"]);
  const p = paginate(all, q);
  p.meta.status_counts = countBy(S.requests, "status");
  send(res, 200, p);
});
on("POST", "/requests", ({ res, body, email }) => {
  const errors = {};
  const project = projectRef(body, errors);
  if (!body.title) errors.title = ["العنوان مطلوب"];
  if (body.amount != null && body.amount > 1_000_000) errors.amount = ["المبلغ يتجاوز الحد المسموح"];
  if (Object.keys(errors).length) return err422(res, errors);
  const id = `R-${S.requests.length + 1}`;
  const r = { id, code: `REQ-${String(S.requests.length + 1).padStart(3, "0")}`, status: "pending", requester: { id: userId(email), name: "ليلى المحمود" }, created_at: new Date().toISOString(), comments: [], attachments: [], activities: [{ id: 1, text: "تم إنشاء الطلب", kind: "created", created_at: new Date().toISOString() }], ...body, project_id: project.id, project: { id: project.id, name: project.name } };
  S.requests.unshift(r);
  send(res, 201, { data: r });
});
on("GET", "/requests/([^/]+)", ({ res, m }) => (R(m[1]) ? send(res, 200, { data: R(m[1]) }) : send(res, 404, { message: "الطلب غير موجود" })));
const SELF_DECISION = "لا يمكنك البت في طلب قدّمته بنفسك؛ يقرره شخص آخر (فصل المهام).";
on("POST", "/requests/([^/]+)/approve", ({ res, m, email }) => {
  const r = R(m[1]);
  if (!r) return send(res, 404, { message: "الطلب غير موجود" });
  if (r.requester?.id === userId(email)) return send(res, 403, { message: SELF_DECISION });
  r.status = "approved";
  r.activities.push({ id: nextId(), text: "تمت الموافقة", kind: "reviewed", created_at: new Date().toISOString() });
  send(res, 200, { data: r });
});
on("POST", "/requests/([^/]+)/reject", ({ res, m, body, email }) => {
  const r = R(m[1]);
  if (r?.requester?.id === userId(email)) return send(res, 403, { message: SELF_DECISION });
  if (!body.reason) return err422(res, { reason: ["سبب الرفض مطلوب"] });
  r.status = "rejected";
  r.activities.push({ id: nextId(), text: `رُفض: ${body.reason}`, kind: "rejected", created_at: new Date().toISOString() });
  send(res, 200, { data: r });
});
on("POST", "/requests/([^/]+)/comments", ({ res, m, body }) => {
  const r = R(m[1]);
  r.comments.push({ id: nextId(), author: { name: "ليلى المحمود", role: "مديرة النظام" }, body: body.body, created_at: new Date().toISOString() });
  send(res, 201, { ok: true });
});
on("POST", "/requests/([^/]+)/attachments", ({ res, m, body }) => {
  const f = body.__files[0];
  R(m[1]).attachments.push({ id: nextId(), name: f.name, size: f.size, mime: f.mime, content: f.content });
  send(res, 201, { ok: true });
});
on("GET", "/requests/([^/]+)/attachments/(\\d+)/download", ({ res, m }) => {
  const a = R(m[1])?.attachments.find((x) => x.id === Number(m[2]));
  if (!a) return send(res, 404, { message: "غير موجود" });
  res.writeHead(200, { "Content-Type": a.mime || "application/octet-stream", "Content-Disposition": `attachment; filename="file"` });
  res.end(a.content);
});
on("POST", "/requests/([^/]+)/tasks", ({ res, m }) => {
  const r = R(m[1]);
  const t = { id: S.tasks.length + 1, code: `TSK-${String(S.tasks.length + 1).padStart(3, "0")}`, title: r.title, description: r.description, status: "todo", priority: r.priority, department: r.department, type: "تدريب", assignee: { id: 1, name: "جلال العمر" }, creator: { name: "ليلى المحمود" }, due_date: null, progress: 0, project_id: r.project_id, project: r.project, request: { id: r.id, code: r.code, title: r.title }, created_at: new Date().toISOString(), comments: [], attachments: [] };
  S.tasks.push(t);
  send(res, 201, { data: t });
});

// --- tasks
const T = (id) => S.tasks.find((t) => t.id === Number(id));
on("GET", "/tasks", ({ res, q }) => {
  const all = filterBy(S.tasks, q, [["status", "status"], ["priority", "priority"], ["department", "department"], ["assignee_id", "assignee_id"]], ["title", "code"]);
  send(res, 200, paginate(all, q));
});
on("POST", "/tasks", ({ res, body }) => {
  const errors = {};
  const project = projectRef(body, errors);
  if (!body.title) errors.title = ["العنوان مطلوب"];
  if (project && body.assignee_id && !project.members.some((x) => String(x.user_id) === String(body.assignee_id))) errors.assignee_id = ["المسؤول المحدد ليس ضمن فريق المشروع."];
  if (Object.keys(errors).length) return err422(res, errors);
  const emp = S.employees.find((e) => String(e.id) === String(body.assignee_id));
  const t = { id: S.tasks.length + 1, code: `TSK-${String(S.tasks.length + 1).padStart(3, "0")}`, status: "todo", progress: 0, creator: { name: "ليلى المحمود" }, created_at: new Date().toISOString(), comments: [], attachments: [], ...body, project_id: project.id, project: { id: project.id, name: project.name }, assignee_id: emp?.id ?? null, assignee: emp ? { id: emp.id, name: emp.name } : null };
  S.tasks.push(t);
  send(res, 201, { data: t });
});
on("GET", "/tasks/(\\d+)", ({ res, m }) => (T(m[1]) ? send(res, 200, { data: T(m[1]) }) : send(res, 404, { message: "المهمة غير موجودة" })));
on("PATCH", "/tasks/(\\d+)", ({ res, m, body }) => {
  Object.assign(T(m[1]), body);
  send(res, 200, { data: T(m[1]) });
});
on("POST", "/tasks/(\\d+)/comments", ({ res, m, body }) => {
  T(m[1]).comments.push({ id: nextId(), author: { name: "ليلى المحمود" }, body: body.body, created_at: new Date().toISOString() });
  send(res, 201, { ok: true });
});
on("POST", "/tasks/(\\d+)/attachments", ({ res, m, body }) => {
  const f = body.__files[0];
  T(m[1]).attachments.push({ id: nextId(), name: f.name, mime: f.mime, content: f.content });
  send(res, 201, { ok: true });
});

// --- people
on("GET", "/employees", ({ res }) => send(res, 200, { data: S.employees }));
on("POST", "/employees", ({ res, body }) => {
  const errors = {};
  if (!body.name) errors.name = ["الاسم مطلوب"];
  if (S.employees.some((e) => e.email === body.email)) errors.email = ["البريد مستخدم"];
  if (Object.keys(errors).length) return err422(res, errors);
  const role = S.roles.find((r) => String(r.id) === String(body.role_id));
  const e = { id: nextId(), ...body, status: body.status || "active", role: role ? { id: role.id, title: role.title } : null, invite_pending: true };
  S.employees.push(e);
  if (e.status === "active") issueInvite(e);
  send(res, 201, { data: e });
});
on("PUT", "/employees/(\\d+)", ({ res, m, body }) => {
  const e = S.employees.find((x) => x.id === Number(m[1]));
  const oldEmail = e.email;
  Object.assign(e, body);
  if (e.invite_pending && e.email !== oldEmail && e.status === "active") {
    delete S.invites[oldEmail];
    issueInvite(e);
  }
  send(res, 200, { data: e });
});
on("POST", "/employees/(\\d+)/invite", ({ res, m }) => {
  const e = S.employees.find((x) => x.id === Number(m[1]));
  if (!e) return send(res, 404, { message: "الموظف غير موجود." });
  if (!e.invite_pending) return send(res, 409, { message: "هذا الموظف فعّل حسابه مسبقاً." });
  if (e.status !== "active") return send(res, 409, { message: "فعّل حساب الموظف أولاً ثم أرسل الدعوة." });
  issueInvite(e);
  send(res, 200, { message: "تم إرسال دعوة جديدة إلى بريد الموظف.", expires_in_hours: 48 });
});
on("DELETE", "/employees/(\\d+)", ({ res, m }) => {
  S.employees = S.employees.filter((x) => x.id !== Number(m[1]));
  res.writeHead(204);
  res.end();
});
on("GET", "/roles", ({ res }) => send(res, 200, { data: S.roles }));
on("GET", "/permissions", ({ res }) => send(res, 200, { data: S.permissions }));
on("POST", "/roles", ({ res, body }) => {
  const r = { id: nextId(), users_count: 0, is_system_admin: false, ...body };
  S.roles.push(r);
  send(res, 201, { data: r });
});
on("PUT", "/roles/(\\d+)", ({ res, m, body }) => {
  const r = S.roles.find((x) => x.id === Number(m[1]));
  Object.assign(r, body);
  send(res, 200, { data: r });
});

// --- files & general reports
on("GET", "/files/folders", ({ res }) => send(res, 200, { data: S.folders.map((f) => ({ ...f, items_count: S.files.filter((x) => x.folder_id === f.id).length })) }));
on("GET", "/files", ({ res, q }) => {
  const fid = q.get("folder_id");
  const items = S.files.filter((f) => !fid || String(f.folder_id) === fid).map(({ content, ...f }) => f);
  send(res, 200, { data: items, meta: { total: items.length } });
});
on("POST", "/files/folders", ({ res, body }) => {
  const errors = {};
  const project = projectRef(body, errors);
  if (!body.name) errors.name = ["الحقل مطلوب."];
  else if (project && S.folders.some((f) => f.project_id === project.id && f.name.toLowerCase() === String(body.name).toLowerCase())) errors.name = ["يوجد مجلد بنفس الاسم."];
  if (Object.keys(errors).length) return err422(res, errors);
  const folder = { id: nextId(), name: body.name, project_id: project.id };
  S.folders.push(folder);
  send(res, 201, { data: { ...folder, items_count: 0 } });
});
on("POST", "/files", ({ res, body }) => {
  const f = body.__files[0];
  if (!S.folders.some((x) => x.id === Number(body.folder_id))) return err422(res, { folder_id: [body.folder_id ? "المجلد المحدد غير موجود." : "الحقل مطلوب."] });
  S.files.push({ id: nextId(), name: f.name, size: f.size, mime: f.mime, folder_id: Number(body.folder_id) || null, created_at: new Date().toISOString(), content: f.content });
  send(res, 201, { ok: true });
});
on("GET", "/files/(\\d+)/download", ({ res, m }) => {
  const f = S.files.find((x) => x.id === Number(m[1]));
  res.writeHead(200, { "Content-Type": f.mime, "Content-Disposition": `attachment; filename="${encodeURIComponent(f.name)}"` });
  res.end(f.content);
});
on("GET", "/reports/summary", ({ res }) => send(res, 200, { data: { total_reports: S.reports.length + 300, monthly_progress: 24, active_sections: 4 } }));
on("GET", "/reports", ({ res, q }) => send(res, 200, { data: S.reports.filter((r) => !q.get("type") || q.get("type") === "all" || r.type === q.get("type")) }));
on("GET", "/reports/(\\d+)/download", ({ res }) => {
  res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="report.pdf"' });
  res.end("%PDF-mock-report");
});

// --- MEAL
const trend = (value, text, direction = "up") => ({ value, trend: { text, direction } });
on("GET", "/meal/stats", ({ res }) =>
  send(res, 200, {
    data: {
      late_indicators: trend(S.indicators.filter((i) => i.status === "delayed").length, "تحتاج متابعة", "down"),
      completion_rate: trend(71.4, "+2.1% عن الربع السابق"),
      beneficiaries: trend(9876, "+5% هذا الشهر"),
      active_projects: { value: 2 },
      reports_in_review: trend(S.mealReports.filter((r) => r.status === "in_review").length, "بانتظار الاعتماد", "neutral"),
      complaints_in_progress: { value: S.complaints.filter((c) => c.status === "in_progress").length },
    },
  }));
on("GET", "/meal/charts", ({ res, q }) => {
  const quarter = q.get("quarter") || "Q1";
  send(res, 200, {
    data: {
      quarters: ["Q1", "Q2"],
      quarter,
      indicators: [{ sector: "المياه", target: 1200, actual: quarter === "Q1" ? 1100 : 900 }, { sector: "الصحة", target: 800, actual: 700 }],
      distribution: [{ label: "نساء", percent: 55 }, { label: "رجال", percent: 45 }],
      total_beneficiaries: 9876,
    },
  });
});
on("GET", "/meal/activity", ({ res, q }) => {
  let rows = [
    ...S.complaints.slice(0, 3).map((c) => ({ id: c.id, type: "complaint", status: c.priority === "sensitive" ? "sensitive" : "in_progress", location: c.region, project: c.project, title: `شكوى ${c.code}`, date: c.received_at })),
    ...S.fieldRecords.map((f) => ({ id: f.id, type: "activity", status: "completed", location: f.region, project: f.project, title: f.title || f.activity_type, date: f.activity_date })),
  ];
  const t = q.get("type");
  if (t && t !== "all") rows = rows.filter((r) => r.type === t);
  const s = q.get("search");
  if (s) rows = rows.filter((r) => JSON.stringify(r).includes(s));
  send(res, 200, { data: rows });
});
on("GET", "/meal/complaints/stats", ({ res }) => {
  const c = countBy(S.complaints, "status");
  const sens = S.complaints.filter((x) => x.priority === "sensitive").length;
  send(res, 200, { data: { total: S.complaints.length, new: c.new || 0, in_progress: c.in_progress || 0, sensitive: sens, resolved: c.resolved || 0, sensitive_open: S.complaints.filter((x) => x.priority === "sensitive" && !["resolved", "closed"].includes(x.status)).length } });
});
on("GET", "/meal/complaints/insights", ({ res }) =>
  send(res, 200, { data: { metrics: [{ label: "متوسط وقت الاستجابة", value: "2.4 يوم", level: "info" }, { label: "نسبة الإغلاق", value: "71%", level: "success" }], alerts: [{ text: "شكوى حساسة تحتاج متابعة", level: "danger" }] } }));
on("GET", "/meal/complaints", ({ res, q }) => {
  let all = S.complaints;
  const st = q.get("status");
  if (st === "sensitive") all = all.filter((c) => c.priority === "sensitive");
  else if (st && st !== "all") all = all.filter((c) => c.status === st);
  all = filterBy(all, q, [["project_id", "project_id"], ["region", "region"], ["priority", "priority"]], ["code", "type"]);
  send(res, 200, paginate(all, q));
});
on("POST", "/meal/complaints", ({ res, body }) => {
  const errors = {};
  const project = mealProject(body, errors);
  if (!body.type) errors.type = ["النوع مطلوب"];
  if (Object.keys(errors).length) return err422(res, errors);
  const c = { id: S.complaints.length + 1, code: `FCRM-${900 + S.complaints.length}`, status: "new", owner: { name: "غير معيّن" }, received_at: new Date().toISOString().slice(0, 10), ...body, ...project };
  S.complaints.unshift(c);
  send(res, 201, { data: c });
});
on("PATCH", "/meal/complaints/(\\d+)", ({ res, m, body }) => {
  Object.assign(S.complaints.find((c) => c.id === Number(m[1])), body);
  send(res, 200, { ok: true });
});
on("GET", "/meal/complaints/export", ({ res }) => {
  res.writeHead(200, { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="complaints.csv"' });
  res.end("code,type\n" + S.complaints.map((c) => `${c.code},${c.type}`).join("\n"));
});
on("GET", "/meal/indicators/stats", ({ res }) => {
  const c = countBy(S.indicators, "status");
  send(res, 200, { data: { total: S.indicators.length, projects_count: 2, on_track: c.on_track || 0, needs_follow: c.needs_follow || 0, delayed: c.delayed || 0, achieved: c.achieved || 0 } });
});
on("GET", "/meal/indicators/insights", ({ res }) =>
  send(res, 200, { data: { insights: [{ text: "أكثر قطاع متأخر: التعليم", level: "danger" }], updates: [{ indicator_id: 3, code: "IND-3.1", text: "يحتاج تحديث" }] } }));
on("GET", "/meal/indicators", ({ res, q }) => send(res, 200, paginate(filterBy(S.indicators, q, [["status", "status"], ["project_id", "project_id"]], ["name", "code"]), q)));
on("POST", "/meal/indicators", ({ res, body }) => {
  const errors = {};
  const project = mealProject(body, errors);
  if (!body.code) errors.code = ["الرمز مطلوب"];
  if (S.indicators.some((i) => i.code === body.code)) errors.code = ["الرمز مستخدم"];
  if (Object.keys(errors).length) return err422(res, errors);
  const i = { id: nextId(), achieved: 0, status: "needs_follow", updated_at: new Date().toISOString(), owner: { name: "—" }, ...body, ...project };
  S.indicators.push(i);
  send(res, 201, { data: i });
});
on("PATCH", "/meal/indicators/(\\d+)", ({ res, m, body }) => {
  const i = S.indicators.find((x) => x.id === Number(m[1]));
  Object.assign(i, body, { updated_at: new Date().toISOString() });
  if (i.achieved >= i.target) i.status = "achieved";
  send(res, 200, { data: i });
});
on("POST", "/meal/indicators/import", ({ res, body }) => send(res, 200, { imported: body.__files.length }));
on("GET", "/meal/indicators/export", ({ res }) => {
  res.writeHead(200, { "Content-Type": "text/csv" });
  res.end("code,name\n");
});
on("GET", "/meal/reports/stats", ({ res }) => {
  const c = countBy(S.mealReports, "status");
  send(res, 200, { data: { total: S.mealReports.length, draft: c.draft || 0, in_review: c.in_review || 0, needs_edit: c.needs_edit || 0, approved: c.approved || 0 } });
});
on("GET", "/meal/reports/insights", ({ res }) => send(res, 200, { data: { summary: [{ text: "تقرير قيد المراجعة", level: "warning" }], actions: [{ text: "تقرير يحتاج تعديل", level: "danger" }] } }));
on("GET", "/meal/reports", ({ res, q }) => send(res, 200, paginate(filterBy(S.mealReports, q, [["status", "status"], ["project_id", "project_id"], ["type", "type"], ["period", "period"]], ["title"]), q)));
on("POST", "/meal/reports", ({ res, body }) => {
  const errors = {};
  const project = mealProject(body, errors);
  if (!body.title) errors.title = ["العنوان مطلوب"];
  if (Object.keys(errors).length) return err422(res, errors);
  const r = { id: nextId(), status: "draft", owner: { name: "ليلى" }, updated_at: new Date().toISOString(), ...body, ...project };
  S.mealReports.push(r);
  send(res, 201, { data: r });
});
on("PATCH", "/meal/reports/(\\d+)", ({ res, m, body }) => {
  Object.assign(S.mealReports.find((r) => r.id === Number(m[1])), body);
  send(res, 200, { ok: true });
});
on("GET", "/meal/report-templates", ({ res }) => send(res, 200, { data: [{ id: 2, name: "قالب الأداء الربعي", type: "تقرير متابعة", description: "وصف القالب" }] }));
on("GET", "/meal/reports/export", ({ res }) => {
  res.writeHead(200, { "Content-Type": "text/csv" });
  res.end("id,title\n");
});
on("GET", "/meal/reports/(\\d+)/download", ({ res }) => {
  res.writeHead(200, { "Content-Type": "application/pdf" });
  res.end("%PDF-mock-meal");
});
on("GET", "/meal/field-records", ({ res, q }) => send(res, 200, paginate([...S.fieldRecords].reverse(), q)));
on("POST", "/meal/field-records", ({ res, body }) => {
  const errors = {};
  const project = mealProject(body, errors); // even a draft belongs to a project
  if (body.status === "submitted" && !body.indicator_id) errors.indicator_id = ["المؤشر مطلوب"];
  if (Object.keys(errors).length) return err422(res, errors);
  const rec = { id: nextId(), ...body, ...project, attachments: body.__files.length };
  delete rec.__files;
  S.fieldRecords.push(rec);
  if (body.status === "submitted") {
    const ind = S.indicators.find((i) => String(i.id) === String(body.indicator_id));
    if (ind) ind.achieved += Number(body.achieved_value || 0);
  }
  send(res, 201, { data: rec });
});

// ------------------------------------------------------------------ server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  const path = url.pathname.replace(/\/api(?=\/)/, ""); // tolerate an /api prefix in API_URL
  const method = req.method;

  // test controls
  if (path === "/__control/reset") { reset(); return send(res, 200, { ok: true }); }
  if (path === "/__control/log") return send(res, 200, { log: LOG, registrations: S.registrations, onboarding: S.onboarding });
  if (path === "/__control/fail" && method === "POST") { FAILS.push({ times: 1, ...(await readBody(req)) }); return send(res, 200, { ok: true }); }
  if (path === "/__control/approve" && method === "POST") { const { email } = await readBody(req); S.users[email].status = "approved"; return send(res, 200, { ok: true }); }
  if (path === "/__control/mail") return send(res, 200, { mail: S.mail });
  if (path === "/__control/state") return send(res, 200, { users: Object.fromEntries(Object.entries(S.users).map(([k, u]) => [k, u.status])), verified: [...S.verified] });

  const body = method === "GET" || method === "DELETE" ? {} : await readBody(req).catch(() => ({}));
  const email = userFromToken(req);
  LOG.push({ method, path, auth: Boolean(email), body: body.__files ? { ...body, __files: body.__files.map((f) => f.name) } : body, authorization: req.headers.authorization ?? null });

  const fail = FAILS.find((f) => (!f.method || f.method === method) && (path === f.path || (f.prefix && path.startsWith(f.prefix))) && f.times > 0);
  if (fail) {
    fail.times -= 1;
    return send(res, fail.status || 500, { message: fail.message || "Server Error" });
  }

  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (!m) continue;
    if (r.auth && !email) return send(res, 401, { message: "Unauthenticated." });
    try {
      return await r.handler({ req, res, body, q: url.searchParams, m, email });
    } catch (e) {
      console.error(e);
      return send(res, 500, { message: String(e.message) });
    }
  }
  send(res, 404, { message: `Not found: ${method} ${path}` });
});

server.listen(PORT, () => console.log(`mock-backend listening on ${ORIGIN}`));
