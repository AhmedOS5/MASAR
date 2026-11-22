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
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));
// eslint-disable-next-line @next/next/no-img-element
vi.mock("next/image", () => ({ default: (p) => <img alt={p.alt} src={p.src} /> }));

import RolesPage from "@/app/dashboard/roles/page";
import FilesPage from "@/app/dashboard/files/page";
import ReportsPage from "@/app/dashboard/reports/page";
import TaskDetailPage from "@/app/dashboard/tasks/[id]/page";
import WaitingApprovalPage from "@/app/onboarding/waiting-approval/page";

beforeEach(() => Object.values(router).forEach((f) => f.mockClear()));
afterEach(() => vi.unstubAllGlobals());

const resolved = (value) => Object.assign(Promise.resolve(value), { status: "fulfilled", value });
const calls = (m, method, path) => m.calls.filter((c) => c.method === method && c.path === path);

/* ------------------------------------------------------------------- ROLES */
describe("Roles page", () => {
  const ROLES = { data: [{ id: 1, title: "دور فريد", users_count: 14, is_system_admin: false, permissions: [{ key: "tasks.view", label: "عرض المهام" }] }] };
  const PERMS = { data: [{ key: "tasks.view", label: "عرض المهام" }, { key: "files.upload", label: "رفع الملفات" }] };

  it("shows API roles and creates / edits one with the selected permissions", async () => {
    const m = mockFetch({ "GET /api/roles": ROLES, "GET /api/permissions": PERMS, "POST /api/roles": { ok: true }, "PUT /api/roles/1": { ok: true } });
    renderWithProviders(<RolesPage />);
    expect(await screen.findByText("دور فريد")).toBeInTheDocument();
    expect(screen.getByText("مخصص لـ 14 مستخدم")).toBeInTheDocument();
    expect(screen.queryByText("محلل بيانات")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /إنشاء دور جديد/ }));
    let dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "إنشاء" }));
    expect(within(dialog).getByText("اسم الدور مطلوب")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/اسم الدور/), "مراجع");
    await user.click(await within(dialog).findByRole("checkbox", { name: "رفع الملفات" }));
    await user.click(within(dialog).getByRole("button", { name: "إنشاء" }));
    await waitFor(() => expect(calls(m, "POST", "/api/roles")[0].body).toEqual({ title: "مراجع", permissions: ["files.upload"] }));

    await user.click(screen.getByRole("button", { name: "تعديل دور فريد" }));
    dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("checkbox", { name: "عرض المهام" })).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(calls(m, "PUT", "/api/roles/1")[0].body).toEqual({ title: "دور فريد", permissions: ["tasks.view"] }));
  });
});

describe("Roles page: permission keys resolve to labels", () => {
  it("shows labels when the API returns bare permission keys", async () => {
    mockFetch({
      "GET /api/roles": { data: [{ id: 9, title: "دور بمفاتيح", users_count: 0, permissions: ["files.upload"] }] },
      "GET /api/permissions": { data: [{ key: "files.upload", label: "رفع الملفات" }] },
    });
    renderWithProviders(<RolesPage />);
    expect(await screen.findByText("رفع الملفات")).toBeInTheDocument();
    expect(screen.queryByText("files.upload")).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------- FILES */
describe("Files page", () => {
  it("lists folders and files from the API, filters by folder, uploads, and links real downloads", async () => {
    const m = mockFetch({
      "GET /api/files/folders": { data: [{ id: 4, name: "مجلد فريد", items_count: 9 }] },
      "GET /api/files": { data: [{ id: 31, name: "ملف-فريد.pdf", size: 3 * 1024 * 1024, created_at: "2026-02-01T00:00:00Z", mime: "application/pdf" }] },
      "POST /api/files": { ok: true },
    });
    const { container } = renderWithProviders(<FilesPage />);
    expect(await screen.findByText("ملف-فريد.pdf")).toBeInTheDocument();
    expect(screen.getByText("9 عنصر")).toBeInTheDocument();
    expect(screen.getByText("3.0 MB")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تحميل ملف-فريد.pdf" })).toHaveAttribute("href", "/api/files/31/download");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /مجلد فريد/ }));
    await waitFor(() => expect(m.calls.some((c) => c.path === "/api/files" && c.url.includes("folder_id=4"))).toBe(true));

    await user.upload(container.querySelector('input[type="file"]'), new File(["x"], "new.docx"));
    await waitFor(() => expect(calls(m, "POST", "/api/files")).toHaveLength(1));
    const fd = calls(m, "POST", "/api/files")[0].init.body;
    expect(fd.get("file").name).toBe("new.docx");
    expect(fd.get("folder_id")).toBe("4");
  });

  it("upload failure shows the server message", async () => {
    mockFetch({
      "GET /api/files/folders": { data: [] },
      "GET /api/files": { data: [] },
      "POST /api/files": json({ message: "الملف أكبر من الحد المسموح" }, { status: 413 }),
    });
    const { container } = renderWithProviders(<FilesPage />);
    await userEvent.setup().upload(container.querySelector('input[type="file"]'), new File(["x"], "big.zip"));
    expect(await screen.findByText("الملف أكبر من الحد المسموح")).toBeInTheDocument();
  });
});

/* ----------------------------------------------------------------- REPORTS */
describe("General reports page", () => {
  it("shows API summary numbers, report list with real PDF links, and a type filter", async () => {
    const m = mockFetch({
      "GET /api/options": { report_types: ["مالي", "ميداني"] },
      "GET /api/reports/summary": { data: { total_reports: 357, monthly_progress: 12, active_sections: 9 } },
      "GET /api/reports": { data: [{ id: 6, name: "تقرير فريد", type: "مالي", period: "مايو 2026" }] },
    });
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByText("تقرير فريد")).toBeInTheDocument();
    expect(await screen.findByText("357")).toBeInTheDocument();
    expect(screen.getByText("+12%")).toBeInTheDocument();
    expect(screen.queryByText("142")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /تحميل PDF/ })).toHaveAttribute("href", "/api/reports/6/download");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /تصفية التقارير/ }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "نوع التقرير" }), "ميداني");
    await waitFor(() => expect(m.calls.some((c) => c.path === "/api/reports" && c.url.includes(`type=${encodeURIComponent("ميداني")}`))).toBe(true));
  });
});

/* ------------------------------------------------------------- TASK DETAIL */
describe("Task detail page", () => {
  const TASK = (over = {}) => ({
    data: {
      id: 3, code: "TSK-303", title: "مهمة فريدة التفاصيل", description: "وصف المهمة من الـ API", status: "in_progress", priority: "high",
      department: "ميداني", due_date: "2026-07-02", progress: 42, assignee: { name: "عادل", role: "مشرف" }, creator: { name: "هبة" },
      request: { id: "R-4", code: "REQ-004", title: "طلب مرتبط" },
      comments: [{ id: 1, author: { name: "كريم" }, body: "تعليق المهمة", created_at: "2026-03-02T11:00:00Z" }],
      attachments: [{ id: 8, name: "بيانات.xlsx", mime: "application/vnd.ms-excel" }],
      ...over,
    },
  });

  const open = () => renderWithProviders(<TaskDetailPage params={resolved({ id: "3" })} />);

  it("renders all fields from the API incl. progress and linked request", async () => {
    mockFetch({ "GET /api/tasks/3": TASK(), "GET /api/options": {} });
    open();
    expect(await screen.findByText("مهمة فريدة التفاصيل")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /REQ-004 – طلب مرتبط/ })).toHaveAttribute("href", "/dashboard/requests/R-4");
    expect(screen.getByText("تعليق المهمة")).toBeInTheDocument();
    expect(screen.queryByText("تحليل بيانات المجتمع")).not.toBeInTheDocument();
  });

  it("status buttons PATCH the status; 'تحديد كمكتمل' sends done + 100%", async () => {
    const m = mockFetch({ "GET /api/tasks/3": TASK(), "PATCH /api/tasks/3": { ok: true }, "GET /api/options": {} });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "محظور" }));
    await waitFor(() => expect(calls(m, "PATCH", "/api/tasks/3")[0].body).toEqual({ status: "blocked" }));
    await user.click(screen.getByRole("button", { name: /تحديد كمكتمل/ }));
    await waitFor(() => expect(calls(m, "PATCH", "/api/tasks/3")[1].body).toEqual({ status: "done", progress: 100 }));
  });

  it("REGRESSION: the page refreshes after an update even though the URL id is a string and the API id a number", async () => {
    let task = TASK().data;
    mockFetch({
      "GET /api/tasks/3": () => ({ data: task }),
      "PATCH /api/tasks/3": (r) => {
        task = { ...task, ...r.body };
        return { data: task };
      },
      "GET /api/options": {},
    });
    open();
    await userEvent.setup().click(await screen.findByRole("button", { name: /تحديد كمكتمل/ }));
    expect(await screen.findByText("100%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /المهمة مكتملة/ })).toBeDisabled();
  });

  it("comment & attachment upload hit the API; edit opens a pre-filled form", async () => {
    const m = mockFetch({
      "GET /api/tasks/3": TASK(),
      "POST /api/tasks/3/comments": { ok: true },
      "POST /api/tasks/3/attachments": { ok: true },
      "GET /api/options": { employees: [{ value: 1, label: "عادل" }] },
    });
    const { container } = open();
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "تعليق جديد" }), "ملاحظة");
    await user.click(screen.getByRole("button", { name: /^إرسال$/ }));
    await waitFor(() => expect(calls(m, "POST", "/api/tasks/3/comments")[0].body).toEqual({ body: "ملاحظة" }));

    await user.upload(container.querySelectorAll('input[type="file"]')[1], new File(["x"], "a.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(calls(m, "POST", "/api/tasks/3/attachments")).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: /تعديل/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/عنوان المهمة/)).toHaveValue("مهمة فريدة التفاصيل");
  });
});

/* -------------------------------------------------------- WAITING APPROVAL */
describe("Waiting-approval page", () => {
  const setup = (session) => {
    const m = mockFetch({ "GET /api/auth/session": session, "POST /api/auth/logout": { ok: true } });
    renderWithProviders(<WaitingApprovalPage />);
    return m;
  };

  it("'تحديث حالة الطلب' checks the server and enters the dashboard once approved", async () => {
    const m = setup({ user: { name: "ن" }, onboarding_status: "approved" });
    await userEvent.setup().click(screen.getByRole("button", { name: /تحديث حالة الطلب/ }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(m.calls.some((c) => c.path === "/api/auth/session")).toBe(true);
  });

  it("stays put with an info toast while still pending", async () => {
    setup({ user: { name: "ن" }, onboarding_status: "pending_approval" });
    await userEvent.setup().click(screen.getByRole("button", { name: /تحديث حالة الطلب/ }));
    expect(await screen.findByText(/لا يزال قيد المراجعة/)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows an error toast (no alert()) when the check fails", async () => {
    mockFetch({ "GET /api/auth/session": json({ message: "الخادم غير متاح" }, { status: 502 }) });
    renderWithProviders(<WaitingApprovalPage />);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    await userEvent.setup().click(screen.getByRole("button", { name: /تحديث حالة الطلب/ }));
    expect(await screen.findByText("الخادم غير متاح")).toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("logout calls the API and returns to /login", async () => {
    const m = setup({ user: { name: "ن" }, onboarding_status: "pending_approval" });
    await userEvent.setup().click(screen.getByRole("button", { name: /تسجيل الخروج/ }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(m.calls.some((c) => c.method === "POST" && c.path === "/api/auth/logout")).toBe(true);
  });
});
