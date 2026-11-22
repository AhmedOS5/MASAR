// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { json, mockFetch } from "@/test/helpers";
import { renderWithProviders } from "@/test/render";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/dashboard/meal",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));

import MealStats from "@/app/dashboard/meal/_components/MealStats";
import MealCharts, { conicStops, niceMax } from "@/app/dashboard/meal/_components/MealCharts";
import MealActivityTable from "@/app/dashboard/meal/_components/MealActivityTable";
import ComplaintsPage from "@/app/dashboard/meal/complaints/page";
import IndicatorsPage from "@/app/dashboard/meal/indicators/page";
import MealReportsPage from "@/app/dashboard/meal/reports/page";
import FieldDataPage from "@/app/dashboard/meal/field-data/page";

beforeEach(() => Object.values(router).forEach((f) => f.mockClear()));
afterEach(() => vi.unstubAllGlobals());

const OPTIONS = {
  projects: ["مشروع ألف", "مشروع باء"],
  regions: ["غزة", "الضفة"],
  sectors: ["المياه", "الصحة"],
  channels: ["الهاتف", "نموذج إلكتروني"],
  complaint_types: ["تأخير توزيع"],
  report_types: ["تقرير متابعة"],
  periods: ["Q1 2026"],
  activity_types: ["توزيع مساعدات"],
  employees: [{ value: 3, label: "منى" }],
};
// MEAL data belongs to a project: the forms offer the projects the person works in (by id)
const PROJECTS = { "GET /api/projects": { data: [{ id: 1, name: "مشروع ألف", status: "active" }, { id: 2, name: "مشروع باء", status: "active" }], meta: { total: 2 } } };
const PROJECT_ID = { "مشروع ألف": 1, "مشروع باء": 2 };
const pickProject = async (user, field, name) => {
  await within(field).findByRole("option", { name });
  await user.selectOptions(field, name);
};
const base = (extra = {}) =>
  mockFetch({
    ...PROJECTS,
    "GET /api/options": OPTIONS,
    "GET /api/auth/session": { user: { name: "مدخلة البيانات" } },
    ...extra,
  });
const calls = (m, method, path) => m.calls.filter((c) => c.method === method && c.path === path);
const lastGet = (m, path) => calls(m, "GET", path).at(-1);

/* ---------------------------------------------------------------- OVERVIEW */
describe("MEAL overview", () => {
  it("MealStats shows API numbers and trend texts", async () => {
    base({
      "GET /api/meal/stats": {
        data: {
          late_indicators: { value: 19, trend: { text: "تحتاج متابعة", direction: "down" } },
          completion_rate: { value: 63.5, trend: { text: "+1.2% عن الربع السابق", direction: "up" } },
          beneficiaries: { value: 4040, trend: { text: "+3% هذا الشهر", direction: "up" } },
          active_projects: { value: 8 },
          reports_in_review: { value: 6, trend: { text: "بانتظار الاعتماد", direction: "neutral" } },
          complaints_in_progress: { value: 29 },
        },
      },
    });
    renderWithProviders(<MealStats />);
    expect(await screen.findByText("+1.2% عن الربع السابق")).toBeInTheDocument();
    await waitFor(
      () => {
        const values = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent.replace(/[,٬\s]/g, ""));
        expect(values).toEqual(["19", "63.5%", "4040", "8", "6", "29"]);
      },
      { timeout: 3000 },
    );
  });

  it("MealCharts: quarter tabs come from the API and switching refetches with ?quarter=", async () => {
    const m = base({
      "GET /api/meal/charts": (r) => ({
        data: {
          quarters: ["Q1", "Q2"],
          quarter: r.url.includes("quarter=Q2") ? "Q2" : "Q1",
          indicators: [{ sector: "قطاع فريد", target: 800, actual: 700 }],
          distribution: [{ label: "نساء", percent: 60 }, { label: "رجال", percent: 40 }],
          total_beneficiaries: 12345,
        },
      }),
    });
    renderWithProviders(<MealCharts />);
    expect(await screen.findByText("قطاع فريد")).toBeInTheDocument();
    expect(screen.getByText(/12[,٬.]?345/)).toBeInTheDocument();
    expect(screen.getByText(/نساء — 60%/)).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "الربع الثاني" }));
    await waitFor(() => expect(m.calls.some((c) => c.url.includes("quarter=Q2"))).toBe(true));
  });

  it("MealCharts: chart helpers", () => {
    expect(niceMax(1250)).toBe(1500);
    expect(niceMax(0)).toBe(4);
    expect(conicStops([{ percent: 60, color: "#a" }, { percent: 40, color: "#b" }])).toBe("#a 0% 60%, #b 60% 100%");
  });

  it("MealActivityTable: tabs & search become server filters; rows come from the API", async () => {
    const m = base({
      "GET /api/meal/activity": {
        data: [{ id: 1, type: "complaint", status: "sensitive", location: "رفح", project: "مشروع ألف", title: "شكوى فريدة FCRM-9", date: "2026-05-05" }],
      },
    });
    renderWithProviders(<MealActivityTable />);
    expect(await screen.findByText("شكوى فريدة FCRM-9")).toBeInTheDocument();
    expect(screen.getByText("شكوى")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "الشكاوى فقط" }));
    await waitFor(() => expect(lastGet(m, "/api/meal/activity").url).toContain("type=complaint"));
    await user.type(screen.getByRole("searchbox", { name: "بحث في الأنشطة" }), "رفح");
    await waitFor(() => expect(lastGet(m, "/api/meal/activity").url).toContain(`search=${encodeURIComponent("رفح")}`));
  });
});

/* -------------------------------------------------------------- COMPLAINTS */
const COMPLAINT_ROUTES = (extra = {}) => ({
  "GET /api/meal/complaints/stats": { data: { total: 128, new: 18, in_progress: 43, sensitive: 7, resolved: 60, sensitive_open: 3 } },
  "GET /api/meal/complaints/insights": {
    data: { metrics: [{ label: "متوسط الاستجابة", value: "9.9 يوم", level: "info" }], alerts: [{ text: "تنبيه فريد من السيرفر", level: "danger" }] },
  },
  "GET /api/meal/complaints": {
    data: [{ id: 1, code: "FCRM-901", type: "نوع فريد", project: "مشروع ألف", region: "غزة", channel: "الهاتف", priority: "sensitive", status: "new", owner: { name: "هالة" }, received_at: "2026-02-02" }],
    meta: { total: 99, current_page: 1, last_page: 10 },
  },
  ...extra,
});

describe("Complaints screen", () => {
  it("everything on screen comes from the API (list, stats, sensitive alert, insights)", async () => {
    base(COMPLAINT_ROUTES());
    renderWithProviders(<ComplaintsPage />);
    expect(await screen.findByText("FCRM-901")).toBeInTheDocument();
    expect(screen.getByText("نوع فريد")).toBeInTheDocument();
    expect(screen.getByText(/يوجد 3 شكوى حساسة مفتوحة/)).toBeInTheDocument();
    expect(await screen.findByText("9.9 يوم")).toBeInTheDocument();
    expect(screen.getByText("تنبيه فريد من السيرفر")).toBeInTheDocument();
    expect(screen.getByText("99 شكوى")).toBeInTheDocument();
    expect(screen.queryByText("FCRM-443")).not.toBeInTheDocument(); // old mock row
  });

  it("'عرض الحساسة', status tabs, selects and search all become query parameters", async () => {
    const m = base(COMPLAINT_ROUTES());
    renderWithProviders(<ComplaintsPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "عرض الحساسة" }));
    await waitFor(() => expect(lastGet(m, "/api/meal/complaints").url).toContain("status=sensitive"));

    await user.click(screen.getByRole("tab", { name: "قيد المعالجة" }));
    await waitFor(() => expect(lastGet(m, "/api/meal/complaints").url).toContain("status=in_progress"));

    await user.selectOptions(screen.getByRole("combobox", { name: "كل المناطق" }), "غزة");
    await waitFor(() => expect(lastGet(m, "/api/meal/complaints").url).toContain(`region=${encodeURIComponent("غزة")}`));

    await user.type(screen.getByRole("searchbox", { name: "بحث في الشكاوى" }), "FCRM");
    await waitFor(() => expect(lastGet(m, "/api/meal/complaints").url).toContain("search=FCRM"));
  });

  it("registering a complaint validates then POSTs and refreshes", async () => {
    const m = base(COMPLAINT_ROUTES({ "POST /api/meal/complaints": { data: { id: 2 } } }));
    renderWithProviders(<ComplaintsPage />);
    const user = userEvent.setup();
    await screen.findByText("FCRM-901");
    await user.click(screen.getByRole("button", { name: /تسجيل شكوى جديدة/ }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "تسجيل الشكوى" }));
    expect(within(dialog).getByText("نوع الشكوى مطلوب")).toBeInTheDocument();
    expect(calls(m, "POST", "/api/meal/complaints")).toHaveLength(0);

    await user.selectOptions(within(dialog).getByLabelText(/نوع الشكوى/), "تأخير توزيع");
    await pickProject(user, within(dialog).getByLabelText(/المشروع/), "مشروع باء");
    await user.selectOptions(within(dialog).getByLabelText(/قناة الاستلام/), "الهاتف");
    await user.click(within(dialog).getByRole("button", { name: "تسجيل الشكوى" }));
    await waitFor(() => expect(calls(m, "POST", "/api/meal/complaints")[0].body).toMatchObject({ type: "تأخير توزيع", project_id: 2, channel: "الهاتف", priority: "medium" }));
  });

  it("the row menu changes the complaint status via PATCH; failure → toast", async () => {
    let fail = false;
    const m = base(
      COMPLAINT_ROUTES({
        "PATCH /api/meal/complaints/1": () => (fail ? json({ message: "لا يمكن إغلاق شكوى حساسة" }, { status: 403 }) : { ok: true }),
      }),
    );
    renderWithProviders(<ComplaintsPage />);
    const user = userEvent.setup();
    await screen.findByText("FCRM-901");
    await user.click(screen.getByRole("button", { name: "إجراءات" }));
    await user.click(screen.getByRole("menuitem", { name: /تحويل إلى: تم الحل/ }));
    await waitFor(() => expect(calls(m, "PATCH", "/api/meal/complaints/1")[0].body).toEqual({ status: "resolved" }));

    fail = true;
    await user.click(screen.getByRole("button", { name: "إجراءات" }));
    await user.click(screen.getByRole("menuitem", { name: /تحويل إلى: مغلقة/ }));
    expect(await screen.findByText("لا يمكن إغلاق شكوى حساسة")).toBeInTheDocument();
  });

  it("list failure shows an error banner (retry) instead of fake rows; export is a real download link", async () => {
    base(COMPLAINT_ROUTES({ "GET /api/meal/complaints": json({ message: "تعذر تحميل الشكاوى" }, { status: 500 }) }));
    renderWithProviders(<ComplaintsPage />);
    expect(await screen.findByText("تعذر تحميل الشكاوى")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /تصدير القائمة/ })).toHaveAttribute("href", "/api/meal/complaints/export");
  });
});

/* -------------------------------------------------------------- INDICATORS */
const IND_ROUTES = (extra = {}) => ({
  "GET /api/meal/indicators/stats": { data: { total: 42, projects_count: 6, on_track: 20, needs_follow: 15, delayed: 7, achieved: 18 } },
  "GET /api/meal/indicators/insights": {
    data: { insights: [{ text: "رؤية فريدة", level: "info" }], updates: [{ indicator_id: 77, code: "EDU-3.1", text: "يحتاج تحديث" }] },
  },
  "GET /api/meal/indicators": {
    data: [{ id: 5, code: "WASH-9.9", name: "مؤشر فريد", project: "مشروع ألف", sector: "المياه", target: 200, achieved: 150, status: "on_track", updated_at: new Date().toISOString(), owner: { name: "سلمى" } }],
    meta: { total: 1, current_page: 1, last_page: 1 },
  },
  ...extra,
});

describe("Indicators screen", () => {
  it("renders API rows with a computed completion %, stats and the 'ضمن N مشاريع' sublabel", async () => {
    base(IND_ROUTES());
    renderWithProviders(<IndicatorsPage />);
    expect(await screen.findByText("WASH-9.9")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument(); // 150 / 200
    expect(await screen.findByText("ضمن 6 مشاريع")).toBeInTheDocument();
    expect(screen.getByText("رؤية فريدة")).toBeInTheDocument();
    expect(screen.queryByText("WASH-1.1")).not.toBeInTheDocument();
  });

  it("updating the achieved value PATCHes it; side-panel 'تحديث' opens the same dialog for that indicator", async () => {
    const m = base(IND_ROUTES({ "PATCH /api/meal/indicators/5": { ok: true }, "PATCH /api/meal/indicators/77": { ok: true } }));
    renderWithProviders(<IndicatorsPage />);
    const user = userEvent.setup();
    await screen.findByText("WASH-9.9");

    await user.click(screen.getByRole("button", { name: "إجراءات" }));
    await user.click(screen.getByRole("menuitem", { name: "تحديث القيمة المحققة" }));
    let dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText(/القيمة المحققة/);
    await user.clear(input);
    await user.type(input, "180");
    await user.click(within(dialog).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(calls(m, "PATCH", "/api/meal/indicators/5")[0].body).toEqual({ achieved: 180 }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(await screen.findByRole("button", { name: "تحديث" }));
    dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("EDU-3.1");
  });

  it("status pills and panel buttons filter on the server; adding an indicator POSTs", async () => {
    const m = base(IND_ROUTES({ "POST /api/meal/indicators": { data: { id: 9 } } }));
    renderWithProviders(<IndicatorsPage />);
    const user = userEvent.setup();
    await screen.findByText("WASH-9.9");

    await user.click(screen.getByRole("tab", { name: "متأخر" }));
    await waitFor(() => expect(lastGet(m, "/api/meal/indicators").url).toContain("status=delayed"));
    await user.click(screen.getByRole("button", { name: "مراجعة المطلوب" }));
    await waitFor(() => expect(lastGet(m, "/api/meal/indicators").url).toContain("status=needs_follow"));

    await user.click(screen.getByRole("button", { name: /إضافة مؤشر/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "إضافة" }));
    expect(within(dialog).getByText("رمز المؤشر مطلوب")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/رمز المؤشر/), "NEW-1.1");
    await user.type(within(dialog).getByLabelText(/اسم المؤشر/), "مؤشر جديد");
    await pickProject(user, within(dialog).getByLabelText(/المشروع/), "مشروع ألف");
    await user.type(within(dialog).getByLabelText(/القيمة المستهدفة/), "300");
    await user.click(within(dialog).getByRole("button", { name: "إضافة" }));
    await waitFor(() => expect(calls(m, "POST", "/api/meal/indicators")[0].body).toMatchObject({ code: "NEW-1.1", name: "مؤشر جديد", project_id: 1, target: 300 }));
  });

  it("import uploads the chosen file as multipart", async () => {
    const m = base(IND_ROUTES({ "POST /api/meal/indicators/import": { ok: true } }));
    const { container } = renderWithProviders(<IndicatorsPage />);
    await screen.findByText("WASH-9.9");
    await userEvent.setup().upload(container.querySelector('input[type="file"]'), new File(["a,b"], "ind.csv", { type: "text/csv" }));
    await waitFor(() => expect(calls(m, "POST", "/api/meal/indicators/import")).toHaveLength(1));
    expect(calls(m, "POST", "/api/meal/indicators/import")[0].init.body.get("file").name).toBe("ind.csv");
  });
});

/* ------------------------------------------------------------------ REPORTS */
const REP_ROUTES = (extra = {}) => ({
  "GET /api/meal/reports/stats": { data: { total: 31, draft: 4, in_review: 5, needs_edit: 6, approved: 16 } },
  "GET /api/meal/reports/insights": { data: { summary: [{ text: "ملخص فريد", level: "info" }], actions: [{ text: "إجراء فريد", level: "danger" }] } },
  "GET /api/meal/reports": {
    data: [{ id: 4, title: "تقرير فريد من السيرفر", type: "تقرير متابعة", project: "مشروع ألف", period: "Q1 2026", status: "in_review", owner: { name: "داليا" }, updated_at: new Date().toISOString() }],
    meta: { total: 1, current_page: 1, last_page: 1 },
  },
  "GET /api/meal/report-templates": { data: [{ id: 2, name: "قالب الأداء الربعي", type: "تقرير متابعة", description: "وصف القالب" }] },
  ...extra,
});

describe("MEAL reports screen", () => {
  it("renders API rows & stats; the row menu changes status and offers a real PDF download", async () => {
    const m = base(REP_ROUTES({ "PATCH /api/meal/reports/4": { ok: true } }));
    renderWithProviders(<MealReportsPage />);
    expect(await screen.findByText("تقرير فريد من السيرفر")).toBeInTheDocument();
    expect(await screen.findByText("ملخص فريد")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "إجراءات" }));
    expect(screen.getByRole("menuitem", { name: "تحميل PDF" })).toHaveAttribute("href", "/api/meal/reports/4/download");
    await user.click(screen.getByRole("menuitem", { name: /تحويل إلى: معتمد/ }));
    await waitFor(() => expect(calls(m, "PATCH", "/api/meal/reports/4")[0].body).toEqual({ status: "approved" }));
  });

  it("templates dialog lists API templates; 'استخدام' opens the create form pre-filled and POSTs", async () => {
    const m = base(REP_ROUTES({ "POST /api/meal/reports": { data: { id: 8 } } }));
    renderWithProviders(<MealReportsPage />);
    const user = userEvent.setup();
    await screen.findByText("تقرير فريد من السيرفر");
    await user.click(screen.getByRole("button", { name: /قوالب التقارير/ }));
    expect(await screen.findByText("وصف القالب")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "استخدام" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/عنوان التقرير/)).toHaveValue("قالب الأداء الربعي");
    await pickProject(user, within(dialog).getByLabelText(/المشروع/), "مشروع باء");
    await user.click(within(dialog).getByRole("button", { name: "إنشاء" }));
    await waitFor(() => expect(calls(m, "POST", "/api/meal/reports")[0].body).toMatchObject({ title: "قالب الأداء الربعي", type: "تقرير متابعة", project_id: 2, template_id: 2 }));
  });

  it("status filters and panel buttons are server-side", async () => {
    const m = base(REP_ROUTES());
    renderWithProviders(<MealReportsPage />);
    const user = userEvent.setup();
    await screen.findByText("تقرير فريد من السيرفر");
    await user.click(screen.getByRole("tab", { name: "بحاجة تعديل" }));
    await waitFor(() => expect(lastGet(m, "/api/meal/reports").url).toContain("status=needs_edit"));
    await user.click(screen.getByRole("button", { name: "عرض الملخص" }));
    await waitFor(() => expect(lastGet(m, "/api/meal/reports").url).toContain("status=in_review"));
  });
});

/* --------------------------------------------------------------- FIELD DATA */
const FIELD_ROUTES = (extra = {}) => ({
  "GET /api/meal/field-records": { data: [{ id: 1, title: "سجل ميداني فريد", status: "completed", activity_date: "2026-04-04" }] },
  "GET /api/meal/indicators": { data: [{ id: 5, code: "WASH-9.9", name: "مؤشر فريد", target: 200, achieved: 0 }], meta: {} },
  "POST /api/meal/field-records": { data: { id: 2 } },
  ...extra,
});

async function completeStep1(user) {
  await pickProject(user, await screen.findByLabelText(/^المشروع/), "مشروع ألف");
  await user.selectOptions(screen.getByLabelText(/^القطاع/), "المياه");
  await user.selectOptions(screen.getByLabelText(/^نوع النشاط/), "توزيع مساعدات");
  await user.type(screen.getByLabelText(/^تاريخ النشاط/), "2026-05-05");
  await user.type(screen.getByLabelText("عنوان النشاط"), "توزيع في الميدان");
}

describe("Field data (4-step form was a static placeholder)", () => {
  it("shows the signed-in user as the entry owner and the real recent records", async () => {
    base(FIELD_ROUTES());
    renderWithProviders(<FieldDataPage />);
    expect(await screen.findByText("سجل ميداني فريد")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("مسؤول الإدخال")).toHaveValue("مدخلة البيانات"));
    expect(screen.getByLabelText("عنوان النشاط")).toHaveValue(""); // no pre-filled fake title
  });

  it("blocks 'next' until the step is valid, then walks all 4 steps and submits multipart data", async () => {
    const m = base(FIELD_ROUTES());
    renderWithProviders(<FieldDataPage />);
    const user = userEvent.setup();
    await screen.findByText("سجل ميداني فريد");

    await user.click(screen.getByRole("button", { name: /التالي/ }));
    expect(await screen.findByText("المشروع مطلوب")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "معلومات النشاط", level: 3 })).toBeInTheDocument();

    await completeStep1(user);
    await user.click(screen.getByRole("button", { name: /التالي/ }));

    // step 2
    expect(await screen.findByRole("heading", { name: "الموقع", level: 3 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /التالي/ }));
    expect(await screen.findByText("المنطقة مطلوبة")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/^المنطقة/), "غزة");
    await user.type(screen.getByLabelText("الموقع / الحي"), "الشجاعية");
    await user.click(screen.getByRole("button", { name: /التالي/ }));

    // step 3 (indicators come from the API)
    expect(await screen.findByRole("heading", { name: "المؤشرات والمستفيدين", level: 3 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /التالي/ }));
    expect(await screen.findByText("اختر المؤشر", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("أدخل القيمة المحققة")).toBeInTheDocument();
    await user.selectOptions(await screen.findByLabelText(/^المؤشر/), "5");
    await user.type(screen.getByLabelText(/^القيمة المحققة/), "150");
    await user.type(screen.getByLabelText("إجمالي المستفيدين"), "432");
    expect(await screen.findByText("75%")).toBeInTheDocument(); // live completion = 150/200
    await user.upload(
      screen.getByLabelText(/المرفقات/),
      new File(["x"], "proof.pdf", { type: "application/pdf" }),
    );
    expect(screen.getAllByText(/proof\.pdf/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /التالي/ }));

    // step 4 -> submit
    expect(await screen.findByRole("heading", { name: "المراجعة والإرسال", level: 3 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "إرسال السجل" }));
    await waitFor(() => expect(calls(m, "POST", "/api/meal/field-records")).toHaveLength(1));

    const fd = calls(m, "POST", "/api/meal/field-records")[0].init.body;
    expect(fd).toBeInstanceOf(FormData);
    expect(Object.fromEntries([...fd.entries()].filter(([k]) => k !== "attachments[]"))).toEqual({
      project_id: "1",
      sector: "المياه",
      activity_type: "توزيع مساعدات",
      activity_date: "2026-05-05",
      title: "توزيع في الميدان",
      region: "غزة",
      location: "الشجاعية",
      indicator_id: "5",
      achieved_value: "150",
      total_beneficiaries: "432",
      status: "submitted",
    });
    expect(fd.getAll("attachments[]")[0].name).toBe("proof.pdf");

    // the form resets for the next record
    await waitFor(() => expect(screen.getByRole("heading", { name: "معلومات النشاط", level: 3 })).toBeInTheDocument());
  });

  it("'حفظ كمسودة' posts status=draft without requiring a complete form", async () => {
    const m = base(FIELD_ROUTES());
    renderWithProviders(<FieldDataPage />);
    const user = userEvent.setup();
    await screen.findByText("سجل ميداني فريد");
    await pickProject(user, screen.getByLabelText(/^المشروع/), "مشروع باء");
    await user.click(screen.getAllByRole("button", { name: /حفظ كمسودة/ })[0]);
    await waitFor(() => expect(calls(m, "POST", "/api/meal/field-records")).toHaveLength(1));
    const fd = calls(m, "POST", "/api/meal/field-records")[0].init.body;
    expect(fd.get("status")).toBe("draft");
    expect(fd.get("project_id")).toBe("2");
  });

  it("a server rejection keeps the user's data on screen and toasts the error", async () => {
    base(FIELD_ROUTES({ "POST /api/meal/field-records": json({ message: "المؤشر مغلق للتحديث", errors: { indicator_id: ["المؤشر مغلق"] } }, { status: 422 }) }));
    renderWithProviders(<FieldDataPage />);
    const user = userEvent.setup();
    await screen.findByText("سجل ميداني فريد");
    await pickProject(user, screen.getByLabelText(/^المشروع/), "مشروع ألف");
    await user.click(screen.getAllByRole("button", { name: /حفظ كمسودة/ })[0]);
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^المشروع/)).toHaveValue("1");
  });

  it("'عرض كل السجلات' loads more records from the API", async () => {
    const m = base(FIELD_ROUTES());
    renderWithProviders(<FieldDataPage />);
    await screen.findByText("سجل ميداني فريد");
    await userEvent.setup().click(screen.getByRole("button", { name: "عرض كل السجلات" }));
    await waitFor(() => expect(lastGet(m, "/api/meal/field-records").url).toContain("per_page=50"));
  });
});
