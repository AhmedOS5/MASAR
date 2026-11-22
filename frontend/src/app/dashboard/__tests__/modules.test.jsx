// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { json, mockFetch } from "@/test/helpers";
import { renderWithProviders } from "@/test/render";

const router = { push: vi.fn(), replace: vi.fn() };
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/dashboard",
  useSearchParams: () => search,
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));

import { NotificationsProvider } from "@/app/dashboard/_context/NotificationsContext";
import UnitsPage from "@/app/dashboard/units/page";
import RequestsPage from "@/app/dashboard/requests/page";
import RequestDetailPage from "@/app/dashboard/requests/[id]/page";
import TasksPage from "@/app/dashboard/tasks/page";
import EmployeesPage from "@/app/dashboard/employees/page";
import StatsGrid from "@/app/dashboard/_components/StatsGrid";
import ActionPanels from "@/app/dashboard/_components/ActionPanels";
import WeeklyActivity from "@/app/dashboard/_components/WeeklyActivity";

beforeEach(() => {
  search = new URLSearchParams();
  Object.values(router).forEach((f) => f.mockClear());
});
afterEach(() => vi.unstubAllGlobals());

const OPTIONS = {
  request_types: ["مشتريات", "لوجستيات"],
  departments: ["العمليات", "المالية"],
  task_types: ["تدريب"],
  employees: [{ value: 7, label: "هدى الخطيب" }],
};
const PROJECT = { id: 5, name: "مشروع المياه", status: "active" };
const PROJECTS = {
  "GET /api/projects": { data: [PROJECT], meta: { total: 1 } },
  "GET /api/projects/5": { data: { ...PROJECT, members: [{ user_id: 7, name: "هدى الخطيب", project_role: "member" }] } },
};
const shell = (ui) => renderWithProviders(<NotificationsProvider>{ui}</NotificationsProvider>);
const base = (extra = {}) =>
  mockFetch({ "GET /api/options": OPTIONS, "GET /api/notifications": { data: [] }, ...PROJECTS, ...extra });
const resolved = (value) => Object.assign(Promise.resolve(value), { status: "fulfilled", value });
const calls = (m, method, path) => m.calls.filter((c) => c.method === method && c.path === path);

/* ------------------------------------------------------------------ UNITS */
const UNITS = [
  { id: 1, title: "وحدة المتابعة الزرقاء", description: "d1", status: "active", tier: "core", roles_count: 12, screens_count: 6, manager_roles: "مدير", icon: "bar-chart", href: "/dashboard/meal" },
  { id: 2, title: "وحدة اللوجستيات الحمراء", description: "d2", status: "inactive", tier: "optional", roles_count: 3, screens_count: 2, manager_roles: "مخزن", icon: "shield" },
  { id: 3, title: "وحدة تحتاج إعداد", description: "d3", status: "setup_required", tier: "core", roles_count: 1, screens_count: 1, manager_roles: "—", icon: "folder" },
  { id: 4, title: "وحدة قيد التطوير", description: "d4", status: "in_development", tier: "core", roles_count: 0, screens_count: 0, manager_roles: "—", icon: "monitor" },
];

describe("Units page", () => {
  it("renders units from the API, derives the stats, and no longer renders a second sidebar", async () => {
    base({ "GET /api/units": { data: UNITS } });
    const { container } = shell(<UnitsPage />);
    expect(await screen.findByText("وحدة المتابعة الزرقاء")).toBeInTheDocument();

    // stat cards: total, active, inactive, needs-setup (derived from the 4 API units)
    const numbers = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent)
      .filter((t) => /^\d+$/.test(t));
    expect(numbers).toEqual(["4", "1", "1", "1"]);

    expect(container.querySelector("aside")).toBeNull(); // the duplicate <Sidebar/> is gone
  });

  it("toggling a unit sends PATCH {enabled}; units in development cannot be toggled", async () => {
    const m = base({ "GET /api/units": { data: UNITS }, "PATCH /api/units/2": { ok: true } });
    shell(<UnitsPage />);
    const toggle = await screen.findByRole("checkbox", { name: "تفعيل وحدة اللوجستيات الحمراء" });
    await userEvent.setup().click(toggle);
    await waitFor(() => expect(calls(m, "PATCH", "/api/units/2")).toHaveLength(1));
    expect(calls(m, "PATCH", "/api/units/2")[0].body).toEqual({ enabled: true });

    expect(screen.getByRole("checkbox", { name: "تفعيل وحدة قيد التطوير" })).toBeDisabled();
  });

  it("filters by tab and search", async () => {
    base({ "GET /api/units": { data: UNITS } });
    shell(<UnitsPage />);
    await screen.findByText("وحدة المتابعة الزرقاء");
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "مفعّلة" }));
    expect(screen.getByText("وحدة المتابعة الزرقاء")).toBeInTheDocument();
    expect(screen.queryByText("وحدة اللوجستيات الحمراء")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "الكل" }));
    await user.type(screen.getByRole("searchbox", { name: "ابحث عن وحدة" }), "الحمراء");
    expect(screen.getByText("وحدة اللوجستيات الحمراء")).toBeInTheDocument();
    expect(screen.queryByText("وحدة المتابعة الزرقاء")).not.toBeInTheDocument();
  });

  it("'إعداد الوحدة' opens a dialog whose save really updates the unit", async () => {
    const m = base({ "GET /api/units": { data: UNITS }, "PATCH /api/units/3": { ok: true } });
    shell(<UnitsPage />);
    await screen.findByText("وحدة تحتاج إعداد");
    const card = screen.getByText("وحدة تحتاج إعداد").closest(".cardContainer");
    const user = userEvent.setup();
    await user.click(within(card).getByRole("button", { name: /إعداد الوحدة/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "حفظ الإعدادات" }));
    await waitFor(() => expect(calls(m, "PATCH", "/api/units/3")[0].body).toEqual({ enabled: true }));
  });

  it("shows the error banner when units fail to load", async () => {
    base({ "GET /api/units": json({ message: "تعذر الوصول" }, { status: 500 }) });
    shell(<UnitsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر الوصول");
  });
});

/* --------------------------------------------------------------- REQUESTS */
const REQ_LIST = {
  data: [
    { id: "R-9", code: "REQ-909", title: "طلب فريد من السيرفر", status: "pending", priority: "urgent", department: "قسم س", type: "مشتريات", requester: { name: "نادين" }, created_at: "2026-03-02T10:00:00Z" },
  ],
  meta: { total: 31, current_page: 1, last_page: 4, status_counts: { pending: 17, rejected: 2 } },
};

describe("Requests page", () => {
  it("shows API rows, the real total, and per-status counts from meta", async () => {
    base({ "GET /api/requests": REQ_LIST });
    shell(<RequestsPage />);
    expect(await screen.findByText("طلب فريد من السيرفر")).toBeInTheDocument();
    expect(screen.getByText(/تم العثور على 31 طلب/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /17.*قيد الانتظار/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "REQ-909" })).toHaveAttribute("href", "/dashboard/requests/R-9");
    expect(screen.queryByText("شراء معدات مكتبية")).not.toBeInTheDocument(); // old mock row
  });

  it("status tabs, priority and search become real query parameters (and page resets)", async () => {
    const m = base({ "GET /api/requests": REQ_LIST });
    shell(<RequestsPage />);
    await screen.findByText("طلب فريد من السيرفر");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "4" })); // last page
    await waitFor(() => expect(m.calls.some((c) => c.url.includes("page=4"))).toBe(true));

    await user.click(screen.getByRole("tab", { name: /قيد الانتظار/ }));
    await waitFor(() => expect(m.calls.some((c) => c.url.includes("status=pending") && c.url.includes("page=1"))).toBe(true));

    await user.selectOptions(screen.getByRole("combobox", { name: "الأولوية" }), "urgent");
    await waitFor(() => expect(m.calls.some((c) => c.url.includes("priority=urgent"))).toBe(true));

    await user.type(screen.getByRole("searchbox", { name: "بحث في الطلبات" }), "حاسوب");
    await waitFor(() => expect(m.calls.some((c) => c.url.includes(`search=${encodeURIComponent("حاسوب")}`))).toBe(true));
  });

  it("starts pre-filtered from ?status= and ?search= (dashboard links / global search)", async () => {
    search = new URLSearchParams("status=pending&search=وقود");
    const m = base({ "GET /api/requests": REQ_LIST });
    shell(<RequestsPage />);
    await waitFor(() => expect(m.calls.some((c) => c.url.includes("status=pending") && c.url.includes(encodeURIComponent("وقود")))).toBe(true));
  });

  it("'?new=1' opens the create dialog", async () => {
    search = new URLSearchParams("new=1");
    base({ "GET /api/requests": REQ_LIST });
    shell(<RequestsPage />);
    expect(await screen.findByRole("dialog")).toHaveTextContent("إنشاء طلب جديد");
  });

  it("creating a request validates locally, then POSTs the payload and refreshes the list", async () => {
    let created = false;
    const m = base({
      "GET /api/requests": () => (created ? { ...REQ_LIST, meta: { ...REQ_LIST.meta, total: 32 } } : REQ_LIST),
      "POST /api/requests": () => {
        created = true;
        return { data: { id: "R-10" } };
      },
    });
    shell(<RequestsPage />);
    await screen.findByText("طلب فريد من السيرفر");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /إنشاء طلب/ }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "إنشاء الطلب" }));
    expect(within(dialog).getByText("عنوان الطلب مطلوب")).toBeInTheDocument();
    expect(within(dialog).getByText("المشروع مطلوب")).toBeInTheDocument(); // a project is mandatory
    expect(calls(m, "POST", "/api/requests")).toHaveLength(0);

    await within(dialog).findByRole("option", { name: "مشروع المياه" });
    await user.selectOptions(within(dialog).getByLabelText(/المشروع/), "5");
    await user.type(within(dialog).getByLabelText(/عنوان الطلب/), "شراء حواسيب");
    await user.selectOptions(within(dialog).getByLabelText(/نوع الطلب/), "مشتريات");
    await user.selectOptions(within(dialog).getByLabelText("الأولوية"), "high");
    await user.type(within(dialog).getByLabelText(/المبلغ التقديري/), "1500");
    await user.click(within(dialog).getByRole("button", { name: "إنشاء الطلب" }));

    await waitFor(() => expect(calls(m, "POST", "/api/requests")).toHaveLength(1));
    expect(calls(m, "POST", "/api/requests")[0].body).toMatchObject({
      title: "شراء حواسيب",
      type: "مشتريات",
      priority: "high",
      amount: 1500,
      project_id: 5,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText(/تم العثور على 32 طلب/)).toBeInTheDocument();
  });

  it("server validation errors (422) appear on the fields and as an error toast; dialog stays open", async () => {
    base({
      "GET /api/requests": REQ_LIST,
      "POST /api/requests": json({ message: "invalid", errors: { amount: ["المبلغ يتجاوز الحد المسموح"] } }, { status: 422 }),
    });
    shell(<RequestsPage />);
    await screen.findByText("طلب فريد من السيرفر");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /إنشاء طلب/ }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("option", { name: "مشروع المياه" });
    await user.selectOptions(within(dialog).getByLabelText(/المشروع/), "5");
    await user.type(within(dialog).getByLabelText(/عنوان الطلب/), "x");
    await user.selectOptions(within(dialog).getByLabelText(/نوع الطلب/), "مشتريات");
    await user.click(within(dialog).getByRole("button", { name: "إنشاء الطلب" }));

    expect((await within(dialog).findAllByText("المبلغ يتجاوز الحد المسموح")).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("empty and error states", async () => {
    base({ "GET /api/requests": { data: [], meta: { total: 0 } } });
    const { unmount } = shell(<RequestsPage />);
    expect(await screen.findByText("لا توجد طلبات مطابقة.")).toBeInTheDocument();
    unmount();

    base({ "GET /api/requests": json({ message: "الخادم متوقف" }, { status: 503 }) });
    shell(<RequestsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("الخادم متوقف");
  });
});

/* ---------------------------------------------------------- REQUEST DETAIL */
const REQ_DETAIL = (over = {}) => ({
  data: {
    id: "R-9",
    code: "REQ-909",
    title: "تفاصيل طلب من السيرفر",
    status: "pending",
    priority: "high",
    type: "مشتريات",
    department: "العمليات",
    description: "وصف قادم من الـ API",
    amount: 8500,
    created_at: "2026-03-02T10:00:00Z",
    requester: { name: "رنا" },
    comments: [{ id: 1, author: { name: "سمير", role: "مدير" }, body: "تعليق حقيقي", created_at: "2026-03-02T11:00:00Z" }],
    attachments: [{ id: 5, name: "عرض.pdf", size: 2048, mime: "application/pdf" }],
    activities: [{ id: 1, text: "أُنشئ الطلب", kind: "created", created_at: "2026-03-02T10:00:00Z" }],
    ...over,
  },
});

describe("Request detail page", () => {
  const renderDetail = () => shell(<RequestDetailPage params={resolved({ id: "R-9" })} />);

  it("renders everything from the API (no hard-coded text)", async () => {
    base({ "GET /api/requests/R-9": REQ_DETAIL() });
    renderDetail();
    expect(await screen.findByText("تفاصيل طلب من السيرفر")).toBeInTheDocument();
    expect(screen.getByText("وصف قادم من الـ API")).toBeInTheDocument();
    expect(screen.getByText("تعليق حقيقي")).toBeInTheDocument();
    expect(screen.getByText("أُنشئ الطلب")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تنزيل" })).toHaveAttribute("href", "/api/requests/R-9/attachments/5/download");
    expect(screen.queryByText("شراء معدات مكتبية")).not.toBeInTheDocument();
  });

  it("approve → POST /approve then refetches the new status", async () => {
    let status = "pending";
    const m = base({
      "GET /api/requests/R-9": () => REQ_DETAIL({ status }),
      "POST /api/requests/R-9/approve": () => {
        status = "approved";
        return { ok: true };
      },
    });
    renderDetail();
    await userEvent.setup().click(await screen.findByRole("button", { name: /الموافقة على الطلب/ }));
    await waitFor(() => expect(calls(m, "POST", "/api/requests/R-9/approve")).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: /الموافقة على الطلب/ })).toBeDisabled());
  });

  it("separation of duties: the person who submitted the request is not offered approve/reject; others are", async () => {
    const session = (id) => ({ user: { id, name: "م", is_system_admin: true, permissions: [] }, organization: { name: "م" }, onboarding_status: "approved" });
    base({ "GET /api/auth/session": session(9), "GET /api/requests/R-9": REQ_DETAIL({ requester: { id: 9, name: "أنا" } }) });
    const own = renderDetail();
    expect(await screen.findByText("تفاصيل طلب من السيرفر")).toBeInTheDocument();
    expect(await screen.findByText(/فصل المهام/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /الموافقة على الطلب/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /رفض الطلب/ })).not.toBeInTheDocument();
    own.unmount();

    base({ "GET /api/auth/session": session(9), "GET /api/requests/R-9": REQ_DETAIL({ requester: { id: 3, name: "رنا" } }) });
    renderDetail();
    expect(await screen.findByRole("button", { name: /الموافقة على الطلب/ })).toBeEnabled();
    expect(screen.queryByText(/فصل المهام/)).not.toBeInTheDocument();
  });

  it("reject needs a reason and sends it", async () => {
    const m = base({ "GET /api/requests/R-9": REQ_DETAIL(), "POST /api/requests/R-9/reject": { ok: true } });
    renderDetail();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /رفض الطلب/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/سبب الرفض/), "خارج الميزانية");
    await user.click(within(dialog).getByRole("button", { name: "تأكيد الرفض" }));
    await waitFor(() => expect(calls(m, "POST", "/api/requests/R-9/reject")[0].body).toEqual({ reason: "خارج الميزانية" }));
  });

  it("approve/reject are disabled once the request is no longer pending", async () => {
    base({ "GET /api/requests/R-9": REQ_DETAIL({ status: "approved" }) });
    renderDetail();
    expect(await screen.findByRole("button", { name: /الموافقة على الطلب/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /رفض الطلب/ })).toBeDisabled();
  });

  it("posting a comment sends {body} and clears the box", async () => {
    const m = base({ "GET /api/requests/R-9": REQ_DETAIL(), "POST /api/requests/R-9/comments": { ok: true } });
    renderDetail();
    const user = userEvent.setup();
    const box = await screen.findByRole("textbox", { name: "تعليق جديد" });
    await user.type(box, "تعليق جديد من الاختبار");
    await user.click(screen.getByRole("button", { name: /إرسال التعليق/ }));
    await waitFor(() => expect(calls(m, "POST", "/api/requests/R-9/comments")[0].body).toEqual({ body: "تعليق جديد من الاختبار" }));
    await waitFor(() => expect(box).toHaveValue(""));
  });

  it("uploading a file posts multipart form data", async () => {
    const m = base({ "GET /api/requests/R-9": REQ_DETAIL(), "POST /api/requests/R-9/attachments": { ok: true } });
    const { container } = renderDetail();
    await screen.findByText("تفاصيل طلب من السيرفر");
    const input = container.querySelector('input[type="file"]');
    await userEvent.setup().upload(input, new File(["x"], "doc.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(calls(m, "POST", "/api/requests/R-9/attachments")).toHaveLength(1));
    const body = calls(m, "POST", "/api/requests/R-9/attachments")[0].init.body;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("file").name).toBe("doc.pdf");
  });

  it("a failing action raises an error toast and keeps the page usable", async () => {
    base({
      "GET /api/requests/R-9": REQ_DETAIL(),
      "POST /api/requests/R-9/approve": json({ message: "ليست لديك صلاحية الموافقة" }, { status: 403 }),
    });
    renderDetail();
    await userEvent.setup().click(await screen.findByRole("button", { name: /الموافقة على الطلب/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ليست لديك صلاحية الموافقة");
    expect(screen.getByText("تفاصيل طلب من السيرفر")).toBeInTheDocument();
  });

  it("404 shows the error banner", async () => {
    base({ "GET /api/requests/R-9": json({ message: "الطلب غير موجود" }, { status: 404 }) });
    renderDetail();
    expect(await screen.findByRole("alert")).toHaveTextContent("الطلب غير موجود");
  });
});

/* ------------------------------------------------------------------- TASKS */
describe("Tasks page", () => {
  it("lists tasks, passes filters to the API and creates a task", async () => {
    const m = base({
      "GET /api/tasks": { data: [{ id: 3, code: "TSK-303", title: "مهمة من الـ API", status: "in_progress", priority: "low", department: "د", assignee: { name: "كمال" }, created_at: "2026-01-01" }], meta: { total: 52, last_page: 6, current_page: 1 } },
      "POST /api/tasks": { data: { id: 4 } },
    });
    shell(<TasksPage />);
    expect(await screen.findByText("مهمة من الـ API")).toBeInTheDocument();
    expect(screen.getByText("52 مهمة")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole("combobox", { name: "الحالة" }), "done");
    await waitFor(() => expect(m.calls.some((c) => c.url.includes("status=done"))).toBe(true));
    await user.selectOptions(screen.getByRole("combobox", { name: "المسؤول" }), "7");
    await waitFor(() => expect(m.calls.some((c) => c.url.includes("assignee_id=7"))).toBe(true));

    await user.click(screen.getByRole("button", { name: /إضافة مهمة جديدة/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/عنوان المهمة/), "مهمة جديدة");
    // a project is mandatory, and the assignee comes from that project's team
    expect(within(dialog).getByLabelText("المسؤول")).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "إنشاء المهمة" }));
    expect(within(dialog).getByText("المشروع مطلوب")).toBeInTheDocument();
    expect(calls(m, "POST", "/api/tasks")).toHaveLength(0);
    await within(dialog).findByRole("option", { name: "مشروع المياه" });
    await user.selectOptions(within(dialog).getByLabelText(/المشروع/), "5");
    await within(dialog).findByRole("option", { name: "هدى الخطيب" });
    await user.selectOptions(within(dialog).getByLabelText("المسؤول"), "7");
    await user.click(within(dialog).getByRole("button", { name: "إنشاء المهمة" }));
    await waitFor(() => expect(calls(m, "POST", "/api/tasks")[0].body).toMatchObject({ title: "مهمة جديدة", assignee_id: "7", project_id: 5 }));
  });
});

/* --------------------------------------------------------------- EMPLOYEES */
const EMPLOYEES = { data: [{ id: 21, name: "جلال العمر", email: "jalal@org.org", role: { id: 1, title: "باحث" }, department: "ميداني", status: "active" }] };

describe("Employees page", () => {
  const roles = { "GET /api/roles": { data: [{ id: 1, title: "باحث" }, { id: 2, title: "مدير" }] } };

  it("lists employees from the API with a working mailto link", async () => {
    base({ "GET /api/employees": EMPLOYEES, ...roles });
    shell(<EmployeesPage />);
    expect(await screen.findByText("جلال العمر")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "مراسلة جلال العمر" })).toHaveAttribute("href", "mailto:jalal@org.org");
    expect(screen.queryByText("أحمد محمد")).not.toBeInTheDocument();
  });

  it("adds an employee (validation, then POST) and edits one (PUT)", async () => {
    const m = base({ "GET /api/employees": EMPLOYEES, "POST /api/employees": { ok: true }, "PUT /api/employees/21": { ok: true }, ...roles });
    shell(<EmployeesPage />);
    await screen.findByText("جلال العمر");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /إضافة موظف جديد/ }));
    let dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "إضافة" }));
    expect(within(dialog).getByText("الاسم مطلوب")).toBeInTheDocument();
    expect(within(dialog).getByText("بريد إلكتروني غير صالح")).toBeInTheDocument();
    expect(calls(m, "POST", "/api/employees")).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/الاسم/), "ريما");
    await user.type(within(dialog).getByLabelText(/البريد الإلكتروني/), "rima@org.org");
    await user.click(within(dialog).getByRole("button", { name: "إضافة" }));
    await waitFor(() => expect(calls(m, "POST", "/api/employees")[0].body).toMatchObject({ name: "ريما", email: "rima@org.org", status: "active" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "تعديل جلال العمر" }));
    dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText(/الاسم/);
    expect(name).toHaveValue("جلال العمر");
    await user.clear(name);
    await user.type(name, "جلال الجديد");
    await user.click(within(dialog).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(calls(m, "PUT", "/api/employees/21")[0].body).toMatchObject({ name: "جلال الجديد" }));
  });

  describe("invitations", () => {
    const pending = (over = {}) => ({ id: 31, name: "ريما الحلبي", email: "rima@org.org", role: null, department: "المالية", status: "active", invite_pending: true, ...over });

    it("a new employee is invited by e-mail: the toast says so; the card shows 'pending activation'", async () => {
      const m = base({
        "GET /api/employees": EMPLOYEES,
        "POST /api/employees": json({ data: pending() }, { status: 201 }),
        ...roles,
      });
      shell(<EmployeesPage />);
      await screen.findByText("جلال العمر");
      expect(screen.queryByText("بانتظار التفعيل")).not.toBeInTheDocument(); // an activated employee has no badge
      expect(screen.queryByRole("button", { name: /إعادة إرسال الدعوة/ })).not.toBeInTheDocument();

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /إضافة موظف جديد/ }));
      const dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByLabelText(/الاسم/), "ريما الحلبي");
      await user.type(within(dialog).getByLabelText(/البريد الإلكتروني/), "rima@org.org");
      await user.click(within(dialog).getByRole("button", { name: "إضافة" }));

      expect(await screen.findByText("تمت إضافة الموظف، وأُرسل رمز التفعيل إلى بريده الإلكتروني.")).toBeInTheDocument();
      expect(calls(m, "POST", "/api/employees")).toHaveLength(1);
    });

    it("lists pending employees with a badge and a resend button that POSTs /employees/:id/invite and toasts the server's message", async () => {
      const m = base({
        "GET /api/employees": { data: [...EMPLOYEES.data, pending()] },
        "POST /api/employees/31/invite": { message: "تم إرسال دعوة جديدة إلى بريد الموظف.", expires_in_hours: 48 },
        ...roles,
      });
      shell(<EmployeesPage />);
      expect(await screen.findByText("بانتظار التفعيل")).toBeInTheDocument(); // only Rima's card
      expect(screen.getAllByText("بانتظار التفعيل")).toHaveLength(1);

      await userEvent.setup().click(screen.getByRole("button", { name: "إعادة إرسال الدعوة إلى ريما الحلبي" }));
      await waitFor(() => expect(calls(m, "POST", "/api/employees/31/invite")).toHaveLength(1));
      expect(await screen.findByText("تم إرسال دعوة جديدة إلى بريد الموظف.")).toBeInTheDocument();
    });

    it("an inactive pending employee has the badge but no resend button (the server would refuse)", async () => {
      base({ "GET /api/employees": { data: [pending({ status: "inactive" })] }, ...roles });
      shell(<EmployeesPage />);
      expect(await screen.findByText("بانتظار التفعيل")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /إعادة إرسال الدعوة/ })).not.toBeInTheDocument();
    });

    it("a refused resend (e.g. the employee just activated) toasts the server message", async () => {
      base({
        "GET /api/employees": { data: [pending()] },
        "POST /api/employees/31/invite": json({ message: "هذا الموظف فعّل حسابه مسبقاً." }, { status: 409 }),
        ...roles,
      });
      shell(<EmployeesPage />);
      await userEvent.setup().click(await screen.findByRole("button", { name: /إعادة إرسال الدعوة/ }));
      expect(await screen.findByRole("alert")).toHaveTextContent("هذا الموظف فعّل حسابه مسبقاً.");
    });

    it("changing the e-mail of a pending employee says a new invitation went to the new address", async () => {
      base({
        "GET /api/employees": { data: [pending()] },
        "PUT /api/employees/31": json({ data: pending({ email: "rima.new@org.org" }) }),
        ...roles,
      });
      shell(<EmployeesPage />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "تعديل ريما الحلبي" }));
      const dialog = await screen.findByRole("dialog");
      const mail = within(dialog).getByLabelText(/البريد الإلكتروني/);
      await user.clear(mail);
      await user.type(mail, "rima.new@org.org");
      await user.click(within(dialog).getByRole("button", { name: "حفظ" }));
      expect(await screen.findByText("تم تحديث بيانات الموظف، وأُرسلت دعوة جديدة إلى بريده الجديد.")).toBeInTheDocument();
    });
  });

  it("delete needs confirmation, then calls DELETE; a failure toasts the server message", async () => {
    let fail = false;
    const m = base({
      "GET /api/employees": EMPLOYEES,
      "DELETE /api/employees/21": () => (fail ? json({ message: "لا يمكن حذف مدير النظام" }, { status: 403 }) : new Response(null, { status: 204 })),
      ...roles,
    });
    shell(<EmployeesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "حذف جلال العمر" }));
    expect(calls(m, "DELETE", "/api/employees/21")).toHaveLength(0); // not yet
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "إلغاء" }));
    expect(calls(m, "DELETE", "/api/employees/21")).toHaveLength(0);

    fail = true;
    await user.click(screen.getByRole("button", { name: "حذف جلال العمر" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "حذف" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("لا يمكن حذف مدير النظام");
  });

  it("empty state", async () => {
    base({ "GET /api/employees": { data: [] }, ...roles });
    shell(<EmployeesPage />);
    expect(await screen.findByText(/لا يوجد موظفون بعد/)).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------- OVERVIEW */
const SUMMARY = {
  stats: {
    active_users: { value: 91, trend_text: "+9% جديد", trend: "up" },
    open_tasks: { value: 77, trend_text: "+1% هذا الأسبوع", trend: "up" },
    running_operations: { value: 55, trend_text: "مستقر", trend: "neutral" },
    important_alerts: { value: 13, trend_text: "تتطلب إجراء", trend: "down" },
  },
  weekly_activity: [
    { date: "2026-03-01", requests: 4, tasks: 6 },
    { date: "2026-03-02", requests: 15, tasks: 5 },
  ],
  active_units: [{ id: 1, title: "وحدة نشطة فريدة", icon: "users" }],
  pending_approvals: [{ id: "R-1", title: "موافقة معلّقة فريدة", amount: 4321, department: "المالية", created_at: new Date().toISOString() }],
  recent_requests: [{ id: "R-2", code: "REQ-777", title: "طلب أخير فريد", status: "in_progress", priority: "urgent", created_at: "2026-03-02T00:00:00Z" }],
  open_tasks: [{ id: 8, code: "TSK-1", title: "مهمة مفتوحة فريدة", status: "todo", assignee: "ياسر", due_date: "2026-04-01" }],
};

describe("Dashboard overview", () => {
  it("StatsGrid counts up to the API numbers (not the old 24/38/12/3)", async () => {
    base({ "GET /api/dashboard/summary": { data: SUMMARY } });
    shell(<StatsGrid />);
    expect(await screen.findByText("+9% جديد")).toBeInTheDocument();
    await waitFor(() => {
      const values = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
      expect(values).toEqual(["91", "77", "55", "13"]);
    }, { timeout: 3000 });
  });

  it("ActionPanels render API rows with links to the detail pages", async () => {
    base({ "GET /api/dashboard/summary": { data: SUMMARY } });
    shell(<ActionPanels />);
    expect(await screen.findByText("موافقة معلّقة فريدة")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /طلب أخير فريد/ })).toHaveAttribute("href", "/dashboard/requests/R-2");
    expect(screen.getByRole("link", { name: /مهمة مفتوحة فريدة/ })).toHaveAttribute("href", "/dashboard/tasks/8");
    expect(screen.getByText(/4[,٬.]?321/)).toBeInTheDocument();
    expect(screen.queryByText("شراء معدات مكتبية")).not.toBeInTheDocument();
  });

  it("WeeklyActivity scales the chart to the data and lists active units", async () => {
    base({ "GET /api/dashboard/summary": { data: SUMMARY } });
    shell(<WeeklyActivity />);
    expect(await screen.findByText("وحدة نشطة فريدة")).toBeInTheDocument();
    // max total is 20 -> axis shows 20 / 15 / 10 / 5 / 0
    for (const tick of ["20", "15", "10", "5", "0"]) expect(screen.getAllByText(tick).length).toBeGreaterThan(0);
  });

  it("each overview widget shows the API error with retry instead of fake numbers", async () => {
    base({ "GET /api/dashboard/summary": json({ message: "ملخص غير متاح" }, { status: 500 }) });
    shell(<StatsGrid />);
    expect(await screen.findByRole("alert")).toHaveTextContent("ملخص غير متاح");
    expect(screen.queryByText("24")).not.toBeInTheDocument();
  });
});
