// Browser end-to-end tests (real Chromium → production Next.js build → mock Laravel API).
import { expect, test } from "@playwright/test";

const API = `http://localhost:${process.env.MOCK_PORT || 4010}`;
const ctl = (path, body) =>
  fetch(`${API}/__control/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
const mockLog = async () => (await fetch(`${API}/__control/log`)).json();

// E2E_BACKEND=real runs against ./backend instead of the mock. The mock fabricates some numbers and uses "R-n" ids;
// the real API computes everything from data, so those expectations are read from the API itself in that mode.
const REAL = process.env.E2E_BACKEND === "real";
const rid = (n) => (REAL ? String(n) : `R-${n}`);
async function apiData(page, path) {
  const token = (await page.context().cookies()).find((c) => c.name === "auth_token")?.value;
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  return (await res.json()).data;
}

let pageErrors;
test.beforeEach(async ({ page }) => {
  await ctl("reset");
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message)); // any uncaught exception fails the test
});
test.afterEach(() => {
  expect(pageErrors, "uncaught browser exceptions").toEqual([]);
});

async function login(page, email = "admin@org.org", password = "Passw0rd!") {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: /دخول الآن/ }).click();
}
async function loginToDashboard(page) {
  await login(page);
  await page.waitForURL("**/dashboard");
}
const toast = (page, text) => page.getByRole("status").filter({ hasText: text });

/* ---------------------------------------------------------------- AUTH */
test.describe("authentication & route protection", () => {
  test("anonymous visitors are bounced from every protected area and sent back after login", async ({ page }) => {
    await page.goto("/dashboard/requests");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Frequests$/);
    await page.getByLabel("البريد الإلكتروني").fill("admin@org.org");
    await page.getByLabel("كلمة المرور").fill("Passw0rd!");
    await page.getByRole("button", { name: /دخول الآن/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/requests$/); // returned to where they were going
    await expect(page.getByText(/تم العثور على 23 طلب/)).toBeVisible();
  });

  test("the login form is empty (no pre-filled credentials)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("البريد الإلكتروني")).toHaveValue("");
    await expect(page.getByLabel("كلمة المرور")).toHaveValue("");
  });

  test("wrong password shows the server error and stays on /login", async ({ page }) => {
    await login(page, "admin@org.org", "bad-password");
    await expect(page.getByRole("alert").filter({ hasText: "بيانات الدخول غير صحيحة" })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unverified e-mail cannot log in (server message is shown)", async ({ page }) => {
    // register a brand-new org through the API, do NOT verify it
    await fetch(`http://localhost:${process.env.E2E_APP_PORT || 3100}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_name: "غير مفعّلة", organization_email: "a@unv.org", admin_email: "unv@unv.org", organization_region: "gaza", organization_phone: "+970 59 1", admin_password: "Passw0rd!", admin_password_confirmation: "Passw0rd!", organization_type: "ngo", agreed_to_terms: true }),
    });
    await login(page, "unv@unv.org");
    await expect(page.getByRole("alert").filter({ hasText: "يرجى تفعيل البريد الإلكتروني أولاً" })).toBeVisible();
  });

  test("login success: token is not reachable from JavaScript; storage holds no secrets", async ({ page }) => {
    await loginToDashboard(page);
    const visible = await page.evaluate(() => ({
      cookie: document.cookie,
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
    }));
    const cookies = await page.context().cookies();
    const auth = cookies.find((c) => c.name === "auth_token");
    expect(visible.cookie).not.toContain("auth_token");
    expect(visible.cookie).not.toContain(auth.value); // the real token value, whatever the backend issues
    expect(visible.local + visible.session).not.toContain(auth.value);
    expect(visible.local + visible.session).not.toContain("Passw0rd");
    expect(auth.httpOnly).toBe(true);
    expect(auth.sameSite).toBe("Lax");
  });

  test("logout button ends the session; the dashboard is blocked afterwards, also via Back", async ({ page }) => {
    await loginToDashboard(page);
    await page.getByRole("button", { name: /تسجيل الخروج/ }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard/tasks");
    await expect(page).toHaveURL(/\/login\?next=/);
    expect((await mockLog()).log.some((l) => l.path === "/logout")).toBe(true);
  });

  test("an expired session during use sends the user to /login and clears the cookie", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/requests");
    await expect(page.getByText(/تم العثور على 23 طلب/)).toBeVisible();
    await ctl("fail", { method: "GET", path: "/requests", status: 401, message: "Unauthenticated.", times: 5 });
    await page.getByRole("tab", { name: /قيد الانتظار/ }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Frequests/);
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "auth_token")).toBeUndefined();
  });
});

/* ------------------------------------------------------------ DASHBOARD */
test.describe("dashboard overview shows backend data", () => {
  test("stat cards, pending approvals, tasks and the user come from the API", async ({ page }) => {
    await loginToDashboard(page);
    await expect(page.getByText("ليلى المحمود").first()).toBeVisible();
    // mock: active_users = 1 active employee + 90, open_tasks = 9 + 70, running = 12, alerts = 2 unread.
    // real: whatever the API computed for this organization (the page must show exactly those values).
    const summary = REAL ? await apiData(page, "/dashboard/summary") : null;
    const stats = REAL ? Object.values(summary.stats).map((s) => String(s.value)) : ["91", "79", "12", "2"];
    for (const v of stats) {
      await expect(page.getByRole("heading", { level: 2 }).filter({ hasText: new RegExp(`^${v}$`) }).first()).toBeVisible({ timeout: 8000 });
    }
    // the mock lists its first rows; the real API lists the NEWEST ones first
    await expect(page.getByText(REAL ? summary.recent_requests[0].title : "طلب اختبار رقم 1").first()).toBeVisible();
    await expect(page.getByText(REAL ? summary.open_tasks[0].title : "مهمة اختبار رقم 1").first()).toBeVisible();
    await expect(page.getByText("شراء معدات مكتبية")).toHaveCount(0); // the old mock row
    await expect(page.getByText("أحمد الراشد")).toHaveCount(0);
  });

  test("quick actions open the create dialogs", async ({ page }) => {
    await loginToDashboard(page);
    await page.getByRole("link", { name: /طلب جديد/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/requests\?new=1/);
    await expect(page.getByRole("dialog")).toContainText("إنشاء طلب جديد");
    await page.getByRole("button", { name: "إلغاء" }).click();
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /مهمة جديدة/ }).click();
    await expect(page.getByRole("dialog")).toContainText("إضافة مهمة جديدة");
  });

  test("clicking a notification marks it read (used to crash) and the unread badge updates", async ({ page }) => {
    await loginToDashboard(page);
    await page.getByRole("button", { name: "الإشعارات", exact: true }).click();
    await page.getByText("تقرير جديد").first().click();
    await expect.poll(async () => (await mockLog()).log.some((l) => l.method === "PATCH" && l.path === "/notifications/1/read")).toBe(true);
    await page.goto("/dashboard/notifications");
    await expect(page.getByText(/لديك 1 إشعارات غير مقروءة/)).toBeVisible();
    await page.getByRole("button", { name: /تحديد الكل كمقروء/ }).click();
    await expect(page.getByText(/لديك 0 إشعارات غير مقروءة/)).toBeVisible();
  });
});

/* ------------------------------------------------------------- REQUESTS */
test.describe("requests module", () => {
  test("filter, paginate, create (validation + server error + success), open and approve", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/requests");
    await expect(page.getByText(/تم العثور على 23 طلب/)).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(11); // header + 10 rows

    await page.getByRole("button", { name: "3", exact: true }).or(page.getByRole("button", { name: "2", exact: true })).first().click();
    await expect(page.getByText("طلب اختبار رقم 11").or(page.getByText("طلب اختبار رقم 21"))).toBeVisible();

    await page.getByRole("tab", { name: /قيد الانتظار/ }).click();
    await expect(page.getByText(/تم العثور على 4 طلب/)).toBeVisible();
    await page.getByRole("searchbox", { name: "بحث في الطلبات" }).fill("رقم 13");
    await expect(page.getByText(/تم العثور على 1 طلب/)).toBeVisible();
    await page.getByRole("searchbox", { name: "بحث في الطلبات" }).fill("");
    await page.getByRole("tab", { name: "الكل" }).click();

    // create: client validation
    await page.getByRole("button", { name: /إنشاء طلب/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "إنشاء الطلب" }).click();
    await expect(dialog.getByText("عنوان الطلب مطلوب")).toBeVisible();
    await expect(dialog.getByText("المشروع مطلوب")).toBeVisible(); // a project is mandatory
    // create: server validation error shown on the field + toast
    await dialog.getByLabel(/المشروع/).selectOption({ label: "مشروع ألف" });
    await dialog.getByLabel("عنوان الطلب").fill("طلب من المتصفح");
    await dialog.getByLabel("نوع الطلب").selectOption("مشتريات");
    // the mock rejects amounts above 1,000,000; the real API above 1,000,000,000
    await dialog.getByLabel("المبلغ التقديري").fill(REAL ? "2000000000" : "5000000");
    await dialog.getByRole("button", { name: "إنشاء الطلب" }).click();
    await expect(dialog.getByText(REAL ? /يجب ألا تزيد القيمة/ : "المبلغ يتجاوز الحد المسموح").first()).toBeVisible();
    await expect(dialog).toBeVisible();
    // create: success
    await dialog.getByLabel("المبلغ التقديري").fill("2500");
    await dialog.getByRole("button", { name: "إنشاء الطلب" }).click();
    await expect(dialog).toBeHidden();
    await expect(toast(page, "تم إنشاء الطلب بنجاح.")).toBeVisible();
    await expect(page.getByText(/تم العثور على 24 طلب/)).toBeVisible();

    // open: whoever submitted a request cannot decide it (separation of duties)
    await page.getByRole("link", { name: "طلب من المتصفح" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/requests/${rid(24)}$`));
    await expect(page.getByRole("heading", { name: "طلب من المتصفح" })).toBeVisible();
    await expect(page.getByText(/فصل المهام/)).toBeVisible();
    await expect(page.getByRole("button", { name: /الموافقة على الطلب/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /رفض الطلب/ })).toHaveCount(0);

    // approve a request somebody else submitted
    await page.goto(`/dashboard/requests/${rid(1)}`);
    await page.getByRole("button", { name: /الموافقة على الطلب/ }).click();
    await expect(toast(page, "تمت الموافقة على الطلب.")).toBeVisible();
    await expect(page.getByRole("button", { name: /الموافقة على الطلب/ })).toBeDisabled();
    // activity timeline entry from the API (the real one also says who approved)
    await expect(REAL ? page.getByText(/تمت الموافقة على الطلب بواسطة/) : page.getByText("تمت الموافقة", { exact: true })).toBeVisible();
  });

  test("detail: reject needs a reason; comment; upload & download an attachment", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto(`/dashboard/requests/${rid(1)}`);
    await page.getByRole("textbox", { name: "تعليق جديد" }).fill("تعليق من المتصفح");
    await page.getByRole("button", { name: /إرسال التعليق/ }).click();
    await expect(page.getByText("تعليق من المتصفح")).toBeVisible();

    await page.locator('input[type="file"]').first().setInputFiles({ name: "عرض.txt", mimeType: "text/plain", buffer: Buffer.from("محتوى المرفق") });
    await expect(page.getByText("عرض.txt")).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "تنزيل" }).first().click()]);
    expect(await (await import("node:fs")).promises.readFile(await download.path(), "utf8")).toBe("محتوى المرفق");

    await page.getByRole("button", { name: /رفض الطلب/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/سبب الرفض/).fill("خارج الميزانية");
    await dialog.getByRole("button", { name: "تأكيد الرفض" }).click();
    await expect(toast(page, "تم رفض الطلب.")).toBeVisible();
    await expect(REAL ? page.getByText(/رُفض الطلب بواسطة .*خارج الميزانية/).first() : page.getByText("رُفض: خارج الميزانية")).toBeVisible();
  });

  test("API failure shows an error banner; retry recovers", async ({ page }) => {
    await loginToDashboard(page);
    await ctl("fail", { method: "GET", path: "/requests", status: 500, message: "خطأ في الخادم التجريبي", times: 3 });
    await page.goto("/dashboard/requests");
    await expect(page.getByRole("alert").filter({ hasText: "خطأ في الخادم التجريبي" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "إعادة المحاولة" }).click();
    await expect(page.getByText(/تم العثور على 23 طلب/)).toBeVisible();
  });

  test("a failing mutation raises an error toast and does not lose the user's input", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto(`/dashboard/requests/${rid(1)}`);
    await ctl("fail", { method: "POST", path: `/requests/${rid(1)}/approve`, status: 403, message: "ليست لديك صلاحية الموافقة", times: 1 });
    await page.getByRole("button", { name: /الموافقة على الطلب/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "ليست لديك صلاحية الموافقة" })).toBeVisible();
    await expect(page.getByRole("button", { name: /الموافقة على الطلب/ })).toBeEnabled(); // still pending, can retry
  });
});

/* ----------------------------------------------------- TASKS / PEOPLE / UNITS */
test.describe("tasks, employees, roles, units, files, reports", () => {
  test("tasks: filter, create, open, change status and complete", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/tasks");
    await expect(page.getByText("12 مهمة").first()).toBeVisible();
    await page.getByRole("combobox", { name: "الحالة" }).selectOption("done");
    await expect(page.getByText(/تم العثور على 3 مهمة/)).toBeVisible();
    await page.getByRole("combobox", { name: "الحالة" }).selectOption("all");

    await page.getByRole("button", { name: /إضافة مهمة جديدة/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/عنوان المهمة/).fill("مهمة من المتصفح");
    await dialog.getByLabel(/المشروع/).selectOption({ label: "مشروع ألف" }); // mandatory; the assignee comes from its team
    await dialog.getByLabel("المسؤول").selectOption({ label: "جلال العمر" });
    await dialog.getByRole("button", { name: "إنشاء المهمة" }).click();
    await expect(toast(page, "تم إنشاء المهمة.")).toBeVisible();

    await page.goto("/dashboard/tasks/1");
    await expect(page.getByRole("heading", { name: "مهمة اختبار رقم 1" })).toBeVisible();
    await page.getByRole("button", { name: "محظور" }).click();
    await expect(toast(page, "تم تحديث المهمة.")).toBeVisible();
    await page.getByRole("button", { name: /تحديد كمكتمل/ }).click();
    await expect(page.getByText("100%")).toBeVisible();
    await expect(page.getByRole("button", { name: /المهمة مكتملة/ })).toBeDisabled();
  });

  test("employees: add, edit, delete (with confirmation)", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/employees");
    await expect(page.getByText("جلال العمر")).toBeVisible();
    await page.getByRole("button", { name: /إضافة موظف جديد/ }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "إضافة" }).click();
    await expect(dialog.getByText("الاسم مطلوب")).toBeVisible();
    await dialog.getByLabel("الاسم").fill("ريما");
    await dialog.getByLabel("البريد الإلكتروني").fill("rima@org.org");
    await dialog.getByRole("button", { name: "إضافة" }).click();
    await expect(page.getByText("ريما", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "تعديل ريما" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("الاسم").fill("ريما المعدّلة");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("ريما المعدّلة")).toBeVisible();

    await page.getByRole("button", { name: "حذف ريما المعدّلة" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "إلغاء" }).click();
    await expect(page.getByText("ريما المعدّلة")).toBeVisible(); // cancel keeps it
    await page.getByRole("button", { name: "حذف ريما المعدّلة" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "حذف", exact: true }).click();
    await expect(page.getByText("ريما المعدّلة")).toHaveCount(0);
  });

  test("roles: create with permissions", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/roles");
    await expect(page.getByText("باحث ميداني").first()).toBeVisible();
    await page.getByRole("button", { name: /إنشاء دور جديد/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/اسم الدور/).fill("مراجع");
    await dialog.getByRole("checkbox", { name: "رفع الملفات" }).check();
    await dialog.getByRole("button", { name: "إنشاء" }).click();
    await expect(page.getByRole("heading", { name: "مراجع" })).toBeVisible();
    await expect(page.getByText("رفع الملفات").first()).toBeVisible();
  });

  test("units: one sidebar only, stats derived, toggle persists", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/units");
    await expect(page.getByText("العمليات الميدانية").first()).toBeVisible();
    await expect(page.locator("aside")).toHaveCount(1); // the duplicate sidebar is gone
    // the <input> is visually hidden; users click the visible slider next to it
    await page.getByRole("checkbox", { name: "تفعيل العمليات الميدانية" }).locator("xpath=following-sibling::span").click();
    await expect(toast(page, "تم تفعيل الوحدة.")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "تفعيل العمليات الميدانية" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "تفعيل الموارد البشرية" })).toBeDisabled(); // in development
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "تفعيل العمليات الميدانية" })).toBeChecked(); // persisted server-side
  });

  test("files: upload then download the same bytes", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/files");
    await expect(page.getByText("تقرير.pdf")).toBeVisible();
    // every file goes into a folder (of a project): the upload waits for one
    await expect(page.getByRole("button", { name: /اختر مجلداً لرفع ملف/ })).toBeDisabled();
    await page.getByRole("button", { name: /التقارير الميدانية/ }).click();
    await expect(page.getByRole("button", { name: "رفع ملف جديد" })).toBeEnabled();
    await page.locator('input[type="file"]').setInputFiles({ name: "جديد.bin", mimeType: "application/octet-stream", buffer: Buffer.from("bytes-123") });
    await expect(toast(page, "تم رفع الملف.")).toBeVisible();
    await expect(page.getByText("جديد.bin")).toBeVisible();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "تحميل جديد.bin" }).click()]);
    expect(await (await import("node:fs")).promises.readFile(await dl.path(), "utf8")).toBe("bytes-123");
  });

  test("reports page: summary and PDF download link", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/reports");
    if (REAL) {
      // computed by the API: stored reports, month-over-month task completion, active units
      const s = await apiData(page, "/reports/summary");
      await expect(page.getByRole("heading", { level: 3 }).filter({ hasText: new RegExp(`^${s.total_reports}$`) }).first()).toBeVisible();
      await expect(page.getByText(`${s.monthly_progress > 0 ? "+" : ""}${s.monthly_progress}%`, { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { level: 3 }).filter({ hasText: new RegExp(`^${s.active_sections}$`) }).first()).toBeVisible();
    } else {
      await expect(page.getByText("301")).toBeVisible(); // 1 report + 300
      await expect(page.getByText("+24%")).toBeVisible();
    }
    await expect(page.getByRole("link", { name: /تحميل PDF/ })).toHaveAttribute("href", "/api/reports/1/download");
  });
});

/* ----------------------------------------------------------------- MEAL */
test.describe("MEAL module", () => {
  test("overview: stats, quarter switch and activity feed", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/meal");
    if (REAL) {
      // the real completion rate is the average indicator progress; there is no "previous quarter" trend text
      const stats = await apiData(page, "/meal/stats");
      await expect(page.getByRole("heading", { level: 2 }).filter({ hasText: `${stats.completion_rate.value.toFixed(1)}%` })).toBeVisible({ timeout: 8000 });
    } else {
      await expect(page.getByRole("heading", { level: 2 }).filter({ hasText: "71.4%" })).toBeVisible({ timeout: 8000 });
      await expect(page.getByText("+2.1% عن الربع السابق")).toBeVisible();
    }
    // the real API only offers the quarters of this year up to the current one, so use the first
    await page.getByRole("button", { name: REAL ? "الربع الأول" : "الربع الثاني" }).click();
    await expect.poll(async () => (await mockLog()).log.some((l) => l.path === "/meal/charts")).toBe(true);
    // beneficiary distribution: the mock has fixed gender shares; the demo data has no field records yet
    await expect(REAL ? page.getByText("لا توجد بيانات توزيع.") : page.getByText(/نساء — 55%/)).toBeVisible();
    await page.getByRole("button", { name: "الشكاوى فقط" }).click();
    // the feed is newest first (ties broken by id), so the real API's first complaint is the last one created
    await expect(page.getByText(REAL ? /شكوى FCRM-913/ : /شكوى FCRM-900/)).toBeVisible();
  });

  test("complaints: sensitive alert filter, create, status change", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/meal/complaints");
    await expect(page.getByText(/يوجد \d+ شكوى حساسة مفتوحة/)).toBeVisible();
    await page.getByRole("button", { name: "عرض الحساسة" }).click();
    await expect(page.getByText("مغلقة")).toHaveCount(0).catch(() => {});
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    for (const t of await rows.allTextContents()) expect(t).toContain("حساسة");

    await page.getByRole("button", { name: /تسجيل شكوى جديدة/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "تسجيل الشكوى" }).click();
    await expect(dialog.getByText("نوع الشكوى مطلوب")).toBeVisible();
    await dialog.getByLabel(/نوع الشكوى/).selectOption("نقص مواد");
    await dialog.getByLabel(/المشروع/).selectOption("مشروع باء");
    await dialog.getByLabel(/قناة الاستلام/).selectOption("الهاتف");
    await dialog.getByLabel("الأولوية").selectOption("sensitive");
    await dialog.getByRole("button", { name: "تسجيل الشكوى" }).click();
    await expect(toast(page, "تم تسجيل الشكوى.")).toBeVisible();

    await page.getByRole("button", { name: "إجراءات" }).first().click();
    await page.getByRole("menuitem", { name: /تحويل إلى: تم الحل/ }).click();
    await expect(toast(page, "تم تحديث حالة الشكوى.")).toBeVisible();
  });

  test("indicators: update the achieved value; the % changes", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/meal/indicators");
    const row = page.locator("tbody tr", { hasText: "IND-1.1" });
    await expect(row).toContainText("50%"); // 50 / 100
    await row.getByRole("button", { name: "إجراءات" }).click();
    await page.getByRole("menuitem", { name: "تحديث القيمة المحققة" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/القيمة المحققة/).fill("80");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    await expect(toast(page, "تم تحديث قيمة المؤشر.")).toBeVisible();
    await expect(page.locator("tbody tr", { hasText: "IND-1.1" })).toContainText("80%");
  });

  test("indicators: duplicate code is rejected by the server and shown on the field", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/meal/indicators");
    await page.getByRole("button", { name: /إضافة مؤشر/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/رمز المؤشر/).fill("IND-1.1");
    await dialog.getByLabel(/اسم المؤشر/).fill("مكرر");
    await dialog.getByLabel(/المشروع/).selectOption("مشروع ألف");
    await dialog.getByLabel(/القيمة المستهدفة/).fill("10");
    await dialog.getByRole("button", { name: "إضافة" }).click();
    await expect(dialog.getByText("الرمز مستخدم").first()).toBeVisible();
  });

  test("reports: template → create → status change → PDF link", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/meal/reports");
    await page.getByRole("button", { name: /قوالب التقارير/ }).click();
    await page.getByRole("button", { name: "استخدام" }).first().click(); // the real API ships three built-in templates
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(/عنوان التقرير/)).toHaveValue("قالب الأداء الربعي");
    await dialog.getByLabel(/المشروع/).selectOption("مشروع باء");
    await dialog.getByRole("button", { name: "إنشاء" }).click();
    await expect(toast(page, "تم إنشاء التقرير كمسودة.")).toBeVisible();
    await expect(page.getByText("قالب الأداء الربعي")).toBeVisible();

    const row = page.locator("tbody tr", { hasText: "تقرير ميل 1" });
    await row.getByRole("button", { name: "إجراءات" }).click();
    await expect(page.getByRole("menuitem", { name: "تحميل PDF" })).toHaveAttribute("href", "/api/meal/reports/1/download");
    await page.getByRole("menuitem", { name: /تحويل إلى: معتمد/ }).click();
    await expect(toast(page, "تم تحديث حالة التقرير.")).toBeVisible();
  });

  test("field data: 4-step form → submit → indicator and activity feed update", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/meal/field-data");
    await expect(page.getByLabel("مسؤول الإدخال")).toHaveValue("ليلى المحمود");

    await page.getByRole("button", { name: /التالي/ }).click();
    await expect(page.getByText("المشروع مطلوب")).toBeVisible();
    await page.getByLabel(/^المشروع/).selectOption("مشروع باء"); // the indicator chosen later (IND-2.1) belongs to this project
    await page.getByLabel(/^القطاع/).selectOption("المياه");
    await page.getByLabel(/^نوع النشاط/).selectOption("توزيع مساعدات");
    await page.getByLabel(/^تاريخ النشاط/).fill("2026-05-05");
    await page.getByLabel("عنوان النشاط").fill("نشاط من المتصفح");
    await page.getByRole("button", { name: /التالي/ }).click();

    await page.getByLabel(/^المنطقة/).selectOption("غزة");
    await page.getByLabel("الموقع / الحي").fill("الشجاعية");
    await page.getByRole("button", { name: /التالي/ }).click();

    await page.getByLabel(/^المؤشر/).selectOption({ label: "IND-2.1 — مؤشر 2" });
    await page.getByLabel(/^القيمة المحققة/).fill("40");
    await page.getByLabel("إجمالي المستفيدين").fill("55");
    await expect(page.getByText("20%").first()).toBeVisible(); // 40 / target 200
    await page.getByLabel(/المرفقات/).setInputFiles({ name: "proof.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-x") });
    await page.getByRole("button", { name: /التالي/ }).click();

    await page.getByRole("button", { name: "إرسال السجل" }).click();
    await expect(toast(page, "تم إرسال السجل الميداني.")).toBeVisible();
    await expect(page.getByText("نشاط من المتصفح")).toBeVisible(); // recent records list

    const log = await mockLog();
    const post = log.log.find((l) => l.method === "POST" && l.path === "/meal/field-records");
    expect(post.body).toMatchObject({ project_id: "2", region: "غزة", indicator_id: "2", achieved_value: "40", status: "submitted" });
    expect(post.body.__files).toEqual(["proof.pdf"]);

    await page.goto("/dashboard/meal/indicators");
    await expect(page.locator("tbody tr", { hasText: "IND-2.1" })).toContainText("140"); // 100 + 40
  });
});

/* ------------------------------------------- REGISTRATION → ONBOARDING JOURNEY */
test.describe("new organization journey", () => {
  test("register → verify e-mail (link) → login → onboarding → waiting → approval → dashboard", async ({ page }) => {
    // 1. register
    await page.goto("/register");
    await page.locator('[name="organizationName"]').fill("مؤسسة الرحلة");
    await page.locator('[name="organizationEmail"]').fill("info@journey.org");
    await page.locator('[name="region"]').selectOption("gaza");
    await page.locator('[name="phone"]').fill("+970 59 123 4567");
    await page.locator('[name="password"]').fill("Str0ng!Pass");
    await page.locator('[name="confirmPassword"]').fill("Str0ng!Pass");
    await page.locator('[name="personalEmail"]').fill("owner@journey.org");
    await page.getByRole("checkbox").check();

    // the password must never reach storage, even while typing
    const stored = await page.evaluate(() => JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage }));
    expect(stored).not.toContain("Str0ng!Pass");

    await page.getByRole("button", { name: /إنشاء مساحة العمل/ }).click();
    await expect(page).toHaveURL(/\/verify-email\?email=owner%40journey\.org/);

    // backend received the exact payload
    const reg = (await mockLog()).registrations.at(-1);
    expect(reg).toEqual({
      organization_name: "مؤسسة الرحلة", organization_email: "info@journey.org", admin_email: "owner@journey.org",
      organization_region: "gaza", organization_phone: "+970 59 123 4567", admin_password: "Str0ng!Pass",
      admin_password_confirmation: "Str0ng!Pass", organization_type: "ngo", agreed_to_terms: true,
    });

    // 2. the 6-digit code arrives by e-mail (read from the backend's outbox); a WRONG code is refused and the user stays
    const codeField = page.getByLabel(/رمز التحقق \(6 أرقام\)/);
    const emailedCode = async () => {
      const { mail } = await (await fetch(`${API}/__control/mail`)).json();
      return /(?<!\d)\d{6}(?!\d)/.exec(mail.filter((m) => m.to === "owner@journey.org").at(-1).text)[0];
    };
    await expect(page.getByRole("button", { name: /تأكيد الرمز/ })).toBeDisabled(); // needs all 6 digits
    const first = await emailedCode();
    await codeField.fill(first === "000000" ? "000001" : "000000");
    await page.getByRole("button", { name: /تأكيد الرمز/ }).click();
    await expect(page.getByText("الرمز غير صحيح أو منتهي الصلاحية.")).toBeVisible();
    await expect(page).toHaveURL(/\/verify-email/);
    // cannot log in yet
    await login(page, "owner@journey.org", "Str0ng!Pass");
    await expect(page.getByRole("alert").filter({ hasText: "يرجى تفعيل البريد الإلكتروني أولاً" })).toBeVisible();

    // 3. the login error leads back to the code screen, where a NEW code can be requested at once and entered
    await page.getByRole("link", { name: /إدخال رمز التحقق/ }).click();
    await expect(page).toHaveURL(/\/verify-email\?email=owner%40journey\.org&resend=1/);
    await page.getByRole("button", { name: /إعادة إرسال الرمز/ }).click();
    await expect(page.getByText(/رمز تحقق جديد/)).toBeVisible();
    await codeField.fill(await emailedCode());
    await page.getByRole("button", { name: /تأكيد الرمز/ }).click();
    await expect(page).toHaveURL(/\/activation-success\?email=/);

    // 4. continue → login (with next=/onboarding) → onboarding form
    await page.getByRole("button", { name: /الانتقال إلى انشاء مساحة العمل/ }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fonboarding/);
    await page.getByLabel("البريد الإلكتروني").fill("owner@journey.org");
    await page.getByLabel("كلمة المرور").fill("Str0ng!Pass");
    await page.getByRole("button", { name: /دخول الآن/ }).click();
    await page.waitForURL("**/onboarding");
    await page.goto("/dashboard"); // not approved → cannot enter
    await expect(page).toHaveURL(/\/onboarding$/);

    // 5. onboarding form: locked org fields prefilled from the registration, missing fields block submit
    await expect(page.locator('[name="orgName"]')).toHaveValue("مؤسسة الرحلة");
    await expect(page.locator('[name="orgType"]')).toHaveValue("NGO");
    await page.getByRole("button", { name: /إرسال للموافقة/ }).click();
    await expect(page.getByText(/حقول مطلوبة لم يتم تعبئتها/)).toBeVisible();

    // server error must be shown, not masked as success
    await page.locator('[name="regNumber"]').fill("PS-777");
    await page.locator('[name="managerName"]').fill("المالك");
    await ctl("fail", { method: "POST", path: "/organization/o", status: 500, message: "خطأ مؤقت في الخادم", times: 1 });
    await page.getByRole("button", { name: /إرسال للموافقة/ }).click();
    await expect(page.getByText("خطأ مؤقت في الخادم")).toBeVisible();
    await expect(page.getByText(/تم إرسال بيانات المنظمة بنجاح/)).toHaveCount(0);
    await expect(page).toHaveURL(/\/onboarding$/);

    // retry succeeds → waiting screen
    await page.getByRole("button", { name: /إرسال للموافقة/ }).click();
    await expect(page).toHaveURL(/\/onboarding\/waiting-approval/);
    const ob = (await mockLog()).onboarding.at(-1);
    expect(ob).toMatchObject({ organization_name: "مؤسسة الرحلة", organization_type: "NGO", registration_number: "PS-777", contact_person_name: "المالك" });

    // 6. still pending: dashboard blocked, refresh shows info toast
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/onboarding\/waiting-approval/);
    await page.getByRole("button", { name: /تحديث حالة الطلب/ }).click();
    await expect(toast(page, /لا يزال قيد المراجعة/)).toBeVisible();

    // 7. platform admin approves → refresh → dashboard
    await ctl("approve", { email: "owner@journey.org" });
    await page.getByRole("button", { name: /تحديث حالة الطلب/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("مؤسسة الرحلة").first()).toBeVisible(); // organization name from the session
  });

  test("a hostile ?link= on the verification page is ignored: nothing is auto-verified and nothing is requested from the attacker's host", async ({ page }) => {
    const requested = [];
    page.on("request", (r) => requested.push(r.url()));
    await page.goto(`/verify-email?email=a%40b.co&link=${encodeURIComponent("https://evil.example/steal")}`);
    await expect(page.getByLabel(/رمز التحقق \(6 أرقام\)/)).toBeVisible(); // the normal code screen
    await expect(page).toHaveURL(/\/verify-email/);
    expect(requested.some((u) => new URL(u).hostname === "evil.example")).toBe(false); // no request TO the attacker host
    expect(requested.some((u) => /verify-link|\/auth\/verify-email/.test(u))).toBe(false); // no verification call without the user typing a code
  });

  test("five wrong codes lock the screen; requesting a new code unlocks it and the right code then works", async ({ page }) => {
    const appPort = process.env.E2E_APP_PORT || 3100;
    const reg = await fetch(`http://localhost:${appPort}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_name: "مؤسسة القفل", organization_email: "info@lock.org", admin_email: "lock@journey.org", organization_region: "gaza", organization_phone: "+970 59 123 4567", admin_password: "Str0ng!Pass", admin_password_confirmation: "Str0ng!Pass", organization_type: "ngo", agreed_to_terms: true }),
    });
    expect(reg.status).toBe(201);
    await page.goto("/verify-email?email=lock%40journey.org&resend=1");
    const codeField = page.getByLabel(/رمز التحقق \(6 أرقام\)/);
    const mailCode = async () => {
      const { mail } = await (await fetch(`${API}/__control/mail`)).json();
      return /(?<!\d)\d{6}(?!\d)/.exec(mail.filter((m) => m.to === "lock@journey.org").at(-1).text)[0];
    };
    const good = await mailCode();
    const bad = good === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) {
      await codeField.fill(bad);
      await page.getByRole("button", { name: /تأكيد الرمز/ }).click();
      await expect(page.getByText("الرمز غير صحيح أو منتهي الصلاحية.")).toBeVisible();
    }
    // the 6th submission (even with the right code) is refused: the code is dead
    await codeField.fill(good);
    await page.getByRole("button", { name: /تأكيد الرمز/ }).click();
    await expect(page.getByText(/تجاوزت عدد المحاولات المسموح بها/).first()).toBeVisible();
    await expect(codeField).toBeDisabled();
    await expect(page).toHaveURL(/\/verify-email/);

    await page.getByRole("button", { name: /إعادة إرسال الرمز/ }).click();
    await expect(codeField).toBeEnabled();
    await codeField.fill(await mailCode());
    await page.getByRole("button", { name: /تأكيد الرمز/ }).click();
    await expect(page).toHaveURL(/\/activation-success\?email=/);
  });

  test("registration: server field errors land on the right inputs", async ({ page }) => {
    await page.goto("/register");
    await page.locator('[name="organizationName"]').fill("م");
    await page.locator('[name="organizationEmail"]').fill("info@x.org");
    await page.locator('[name="region"]').selectOption("gaza");
    await page.locator('[name="phone"]').fill("+970 59 123 4567");
    await page.locator('[name="password"]').fill("Str0ng!Pass");
    await page.locator('[name="confirmPassword"]').fill("Str0ng!Pass");
    await page.locator('[name="personalEmail"]').fill("admin@org.org"); // already registered
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /إنشاء مساحة العمل/ }).click();
    await expect(page.getByText("هذا البريد مستخدم مسبقاً").first()).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });
});

/* ------------------------------------------------------------ FORGOT PASSWORD */
test.describe("forgot password journey", () => {
  const NEW_PASSWORD = "N3w!Password";
  const mailCodeFor = async (to) => {
    const { mail } = await (await fetch(`${API}/__control/mail`)).json();
    return /(?<!\d)\d{6}(?!\d)/.exec(mail.filter((m) => m.to === to).at(-1).text)[0];
  };
  async function requestCode(page, email) {
    await page.goto("/login");
    await page.getByLabel("البريد الإلكتروني").fill(email);
    await page.getByRole("link", { name: "نسيت كلمة المرور؟" }).click();
    await expect(page).toHaveURL(/\/forgot-password\?email=/);
    await expect(page.getByLabel("البريد الإلكتروني")).toHaveValue(email); // carried over from the login form
    await page.getByRole("button", { name: /إرسال رمز إعادة التعيين/ }).click();
    await expect(page).toHaveURL(/\/reset-password\?email=.*sent=1/);
    await expect(page.getByRole("status").filter({ hasText: "إذا كان البريد مرتبطاً بحساب مفعّل" })).toBeVisible();
  }
  async function fillReset(page, code, password = NEW_PASSWORD) {
    await page.getByLabel(/رمز إعادة التعيين/).fill(code);
    await page.getByLabel("كلمة المرور الجديدة").fill(password);
    await page.getByLabel("تأكيد كلمة المرور", { exact: true }).fill(password);
    await page.getByRole("button", { name: /تغيير كلمة المرور/ }).click();
  }

  test("login → 'forgot password' → e-mailed code → new password → login with it (the old one no longer works)", async ({ page }) => {
    await requestCode(page, "admin@org.org");
    const code = await mailCodeFor("admin@org.org");

    // a weak password is refused locally, a wrong code by the server — the user stays on the page
    await fillReset(page, code, "weakpass");
    await expect(page.getByText(/لا تستوفي الشروط/)).toBeVisible();
    await fillReset(page, code === "000000" ? "000001" : "000000");
    await expect(page.getByText("الرمز غير صحيح أو منتهي الصلاحية.")).toBeVisible();
    await expect(page).toHaveURL(/\/reset-password/);

    await fillReset(page, code);
    await expect(page).toHaveURL(/\/login\?reset=1&email=admin%40org\.org/);
    await expect(page.getByRole("status").filter({ hasText: "تم تغيير كلمة المرور" })).toBeVisible();
    await expect(page.getByLabel("البريد الإلكتروني")).toHaveValue("admin@org.org");

    // the old password is dead...
    await page.getByLabel("كلمة المرور").fill("Passw0rd!");
    await page.getByRole("button", { name: /دخول الآن/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: /غير صحيحة/ })).toBeVisible();
    // ...the new one works
    await page.getByLabel("كلمة المرور").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: /دخول الآن/ }).click();
    await page.waitForURL("**/dashboard");
  });

  test("a signed-in session is ended by a reset made elsewhere; five wrong codes lock the screen and 'resend' unlocks it", async ({ page, browser }) => {
    await loginToDashboard(page); // a session that existed before the reset
    // the reset is made from ANOTHER browser (its own cookies), like a thief — or the owner on a new device
    const elsewhere = await browser.newContext({ baseURL: `http://localhost:${process.env.E2E_APP_PORT || 3100}`, locale: "ar" });
    const other = await elsewhere.newPage();
    await requestCode(other, "admin@org.org");
    const first = await mailCodeFor("admin@org.org");
    const bad = first === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) {
      await fillReset(other, bad);
      await expect(other.getByText("الرمز غير صحيح أو منتهي الصلاحية.")).toBeVisible();
    }
    await fillReset(other, first); // the 6th submission — even with the right code — is refused and the field locks
    await expect(other.getByText(/تجاوزت عدد المحاولات المسموح بها/).first()).toBeVisible();
    await expect(other.getByLabel(/رمز إعادة التعيين/)).toBeDisabled();

    await other.getByRole("button", { name: /إعادة إرسال الرمز/ }).click();
    await expect(other.getByLabel(/رمز إعادة التعيين/)).toBeEnabled();
    await fillReset(other, await mailCodeFor("admin@org.org"));
    await expect(other).toHaveURL(/\/login\?reset=1/);
    await elsewhere.close();

    // the session that was open before the reset is gone: the next API call sends the user to the login page
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
  });

  test("the reset page does not reveal whether an account exists (same screen for an unknown address)", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("البريد الإلكتروني").fill("nobody@nowhere.org");
    await page.getByRole("button", { name: /إرسال رمز إعادة التعيين/ }).click();
    await expect(page).toHaveURL(/\/reset-password\?email=nobody%40nowhere\.org&sent=1/);
    await expect(page.getByRole("status").filter({ hasText: "إذا كان البريد مرتبطاً بحساب مفعّل" })).toBeVisible();
  });
});

/* ------------------------------------------------------------ MASAR 2027 SHELL */
test.describe("MASAR 2027 shell", () => {
  test("the dark theme and the collapsed sidebar are remembered across reloads", async ({ page }) => {
    await loginToDashboard(page);
    await page.getByRole("button", { name: "المظهر الداكن" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-app-theme", "dark");
    await page.getByRole("button", { name: "طي القائمة الجانبية" }).click();
    await expect(page.getByRole("button", { name: "توسيع القائمة الجانبية" })).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-app-theme", "dark"); // applied before paint by the boot script
    await expect(page.getByRole("button", { name: "توسيع القائمة الجانبية" })).toBeVisible();
  });

  test("employees: the figures filter the cards and the search narrows them", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/dashboard/employees");
    await expect(page.getByText("جلال العمر")).toBeVisible();
    await page.getByRole("button", { name: /^غير نشطين/ }).click();
    await expect(page.getByText("منى سالم")).toBeVisible();
    await expect(page.getByText("جلال العمر")).toHaveCount(0);
    await page.getByRole("button", { name: /^إجمالي الموظفين/ }).click();
    await page.getByRole("searchbox", { name: "بحث في الموظفين" }).fill("jalal");
    await expect(page.getByText("جلال العمر")).toBeVisible();
    await expect(page.getByText("منى سالم")).toHaveCount(0);
  });
});

/* ---------------------------------------------------------- PLATFORM OPERATOR */
test.describe("platform operator", () => {
  test("signs in to the operator page instead of the dashboard, cannot open the workspace, and can log out", async ({ page }) => {
    await login(page, "ops@masar.io");
    await page.waitForURL("**/operator");
    await expect(page.getByRole("heading", { level: 1, name: "حساب مشغّل المنصة" })).toBeVisible();
    await expect(page.getByText(/أهلاً فريق مسار/)).toBeVisible();
    await expect(page.getByText("npm run cli -- approve")).toBeVisible();
    // the console itself: platform-wide figures and the organizations table
    await expect(page.getByRole("region", { name: "الإحصائيات الشاملة" }).getByText("المؤسسات النشطة")).toBeVisible();
    await expect(page.getByRole("heading", { name: /إدارة المؤسسات/ })).toBeVisible();

    // the workspace is closed to them: no broken dashboard full of 403s
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/operator$/);
    await page.goto("/dashboard/employees");
    await expect(page).toHaveURL(/\/operator$/);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/operator$/);

    await page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/operator");
    await expect(page).toHaveURL(/\/login\?next=%2Foperator/);
  });

  test("reviews a pending organization and approves it from the console", async ({ page }) => {
    test.skip(REAL, "the mock seeds a pending organization; the real database starts empty");
    await login(page, "ops@masar.io");
    await page.waitForURL("**/operator");
    await page.getByRole("button", { name: "مراجعة جمعية الأمل" }).click();
    const review = page.getByRole("dialog");
    await expect(review.getByRole("heading", { name: "جمعية الأمل" })).toBeVisible();
    await review.getByRole("button", { name: "إغلاق", exact: true }).click();
    await page.getByRole("button", { name: "اعتماد جمعية الأمل" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "اعتماد", exact: true }).click();
    await expect(toast(page, "تم اعتماد المؤسسة")).toBeVisible();
    await expect(page.getByRole("button", { name: "تعليق جمعية الأمل" })).toBeVisible();
  });

  test("an organization admin cannot open the operator page", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/operator");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

/* ------------------------------------------------------- EMPLOYEE INVITATION */
test.describe("employee invitation journey", () => {
  const NEW_PASSWORD = "N3w!Password";
  // the invitation code only ever travels by e-mail; the test reads it from the backend's outbox like a user reads their inbox
  const mailCodeFor = async (to) => {
    const { mail } = await (await fetch(`${API}/__control/mail`)).json();
    return /(?<!\d)\d{6}(?!\d)/.exec(mail.filter((m) => m.to === to).at(-1).text)[0];
  };
  const employeeCard = (page, name) => page.getByRole("heading", { name, exact: true }).locator("..");

  async function addEmployee(page, name, email) {
    await page.goto("/dashboard/employees");
    await page.getByRole("button", { name: /إضافة موظف جديد/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("الاسم").fill(name);
    await dialog.getByLabel("البريد الإلكتروني").fill(email);
    await dialog.getByRole("button", { name: "إضافة" }).click();
    await expect(toast(page, /أُرسل رمز التفعيل/)).toBeVisible();
    await expect(employeeCard(page, name).getByText("بانتظار التفعيل")).toBeVisible();
  }
  async function fillActivation(page, code) {
    await page.getByLabel(/رمز الدعوة/).fill(code);
    await page.getByLabel("كلمة المرور الجديدة").fill(NEW_PASSWORD);
    await page.getByLabel("تأكيد كلمة المرور", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: /تفعيل الحساب/ }).click();
  }

  test("admin adds an employee → the invited employee sets a password with the e-mailed code → signs in", async ({ page }) => {
    await loginToDashboard(page);
    await addEmployee(page, "سناء الحلبي", "sanaa@org.org");
    const code = await mailCodeFor("sanaa@org.org");

    // the employee opens the page from the e-mail (signed out): the address is pre-filled
    await page.context().clearCookies();
    await page.goto(`/set-password?email=${encodeURIComponent("sanaa@org.org")}`);
    await expect(page.getByLabel("البريد الإلكتروني")).toHaveValue("sanaa@org.org");
    await expect(page.getByRole("button", { name: /تفعيل الحساب/ })).toBeDisabled();

    // a weak password is refused locally, a wrong code by the server — the user stays on the page
    await page.getByLabel(/رمز الدعوة/).fill(code);
    await page.getByLabel("كلمة المرور الجديدة").fill("weakpass");
    await page.getByLabel("تأكيد كلمة المرور", { exact: true }).fill("weakpass");
    await page.getByRole("button", { name: /تفعيل الحساب/ }).click();
    await expect(page.getByText(/لا تستوفي الشروط/)).toBeVisible();
    await page.getByLabel(/رمز الدعوة/).fill(code === "000000" ? "000001" : "000000");
    await page.getByLabel("كلمة المرور الجديدة").fill(NEW_PASSWORD);
    await page.getByLabel("تأكيد كلمة المرور", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: /تفعيل الحساب/ }).click();
    await expect(page.getByText("الرمز غير صحيح أو منتهي الصلاحية.")).toBeVisible();
    await expect(page).toHaveURL(/\/set-password/);
    expect(await loginRefused(page)).toBe(true); // still cannot sign in: no password has been set

    // the right code activates the account and hands over to the login page
    await page.goto(`/set-password?email=${encodeURIComponent("sanaa@org.org")}`);
    await fillActivation(page, code);
    await expect(page).toHaveURL(/\/login\?activated=1&email=sanaa%40org\.org/);
    await expect(page.getByRole("status").filter({ hasText: "تم تفعيل حسابك" })).toBeVisible();
    await expect(page.getByLabel("البريد الإلكتروني")).toHaveValue("sanaa@org.org");

    await page.getByLabel("كلمة المرور").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: /دخول الآن/ }).click();
    await page.waitForURL("**/dashboard");
    await expect(page.getByText("سناء الحلبي").first()).toBeVisible(); // the session belongs to the new employee

    // ...and the admin's list no longer marks them as pending
    await page.context().clearCookies();
    await loginToDashboard(page);
    await page.goto("/dashboard/employees");
    await expect(employeeCard(page, "سناء الحلبي")).toBeVisible();
    await expect(employeeCard(page, "سناء الحلبي").getByText("بانتظار التفعيل")).toHaveCount(0);
    await expect(employeeCard(page, "سناء الحلبي").getByRole("button", { name: /إعادة إرسال الدعوة/ })).toHaveCount(0);
  });

  test("five wrong codes lock the invitation; the admin re-sends it from the employees page and the new code works", async ({ page }) => {
    await loginToDashboard(page);
    await addEmployee(page, "هالة النمر", "halanimr@org.org");
    const first = await mailCodeFor("halanimr@org.org");
    const bad = first === "000000" ? "000001" : "000000";

    await page.context().clearCookies();
    await page.goto(`/set-password?email=${encodeURIComponent("halanimr@org.org")}`);
    for (let i = 0; i < 5; i++) {
      await fillActivation(page, bad);
      await expect(page.getByText("الرمز غير صحيح أو منتهي الصلاحية.")).toBeVisible();
    }
    // the 6th submission — even with the right code — is refused and the field is locked
    await fillActivation(page, first);
    await expect(page.getByText(/تجاوزت عدد المحاولات المسموح بها/).first()).toBeVisible();
    await expect(page.getByLabel(/رمز الدعوة/)).toBeDisabled();
    await expect(page).toHaveURL(/\/set-password/);

    // the employee asks the admin, who re-sends the invitation
    await loginToDashboard(page);
    await page.goto("/dashboard/employees");
    await employeeCard(page, "هالة النمر").getByRole("button", { name: /إعادة إرسال الدعوة/ }).click();
    await expect(toast(page, "تم إرسال دعوة جديدة إلى بريد الموظف.")).toBeVisible();
    const second = await mailCodeFor("halanimr@org.org");

    await page.context().clearCookies();
    await page.goto(`/set-password?email=${encodeURIComponent("halanimr@org.org")}`);
    await fillActivation(page, second);
    await expect(page).toHaveURL(/\/login\?activated=1/);
  });

  test("the login page links invited employees to the activation page", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "فعّل حسابك" }).click();
    await expect(page).toHaveURL(/\/set-password$/);
    await expect(page.getByLabel("البريد الإلكتروني")).toHaveValue("");
  });
});

/** True when logging in as the not-yet-activated employee is refused (no password exists yet). */
async function loginRefused(page) {
  const res = await page.request.post("/api/auth/login", { data: { email: "sanaa@org.org", password: "N3w!Password" } });
  return res.status() === 401;
}
