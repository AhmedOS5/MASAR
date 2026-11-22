// @vitest-environment jsdom
// Role history on the employee card, list settings, folder creation / report upload on the general pages,
// and the blocked-organization message on the login screen.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

import { NotificationsProvider } from "@/app/dashboard/_context/NotificationsContext";
import EmployeesPage from "@/app/dashboard/employees/page";
import SettingsPage from "@/app/dashboard/settings/page";
import FilesPage from "@/app/dashboard/files/page";
import ReportsPage from "@/app/dashboard/reports/page";
import LoginForm from "@/app/login/_components/LoginForm";

afterEach(() => vi.unstubAllGlobals());

const ADMIN = { user: { id: 1, name: "ليلى", is_system_admin: true, permissions: [] }, organization: { name: "م" }, onboarding_status: "approved" };
const sessionOf = (permissions) => ({ user: { id: 5, name: "سارة", is_system_admin: false, permissions }, organization: { name: "م" }, onboarding_status: "approved" });
const calls = (m, method, path) => m.calls.filter((c) => c.method === method && c.path === path);
const shell = (ui) => renderWithProviders(<NotificationsProvider>{ui}</NotificationsProvider>);
const base = (extra = {}) => ({ "GET /api/auth/session": ADMIN, "GET /api/notifications": { data: [] }, "GET /api/options": { data: { departments: ["المالية", "العمليات"], regions: [] } }, ...extra });

describe("role history on the employee card", () => {
  it("lists who set the role and how (automatic from the category / changed by hand) with role names", async () => {
    mockFetch(
      base({
        "GET /api/employees": { data: [{ id: 21, name: "جلال العمر", email: "j@org.org", role: { id: 2, title: "مراجع" }, role_source: "manual", status: "active" }] },
        "GET /api/roles": { data: [{ id: 1, title: "مسؤول متابعة وتقييم" }, { id: 2, title: "مراجع" }] },
        "GET /api/job-categories": { data: [{ key: "meal", label: "المتابعة والتقييم", role_title: "مسؤول متابعة وتقييم", view: [], edit: [], permissions: [] }] },
        "GET /api/employees/21/audit": {
          data: [
            { id: 2, action: "employee.role_changed", actor: { id: 1, name: "ليلى" }, meta: { from: 1, to: 2, previous_source: "auto" }, created_at: "2026-11-16T10:00:00Z" },
            { id: 1, action: "employee.role_auto_assigned", actor: { id: 1, name: "ليلى" }, meta: { from: null, to: 1, category: "meal" }, created_at: "2026-11-15T10:00:00Z" },
          ],
        },
      }),
    );
    shell(<EmployeesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "سجل دور جلال العمر" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("غُيّر الدور يدوياً")).toBeInTheDocument();
    expect(within(dialog).getByText("عُيّن الدور تلقائياً")).toBeInTheDocument();
    expect(within(dialog).getByText(/مسؤول متابعة وتقييم ← مراجع/)).toBeInTheDocument();
    expect(within(dialog).getByText(/بلا دور ← مسؤول متابعة وتقييم/)).toBeInTheDocument();
    expect(within(dialog).getByText(/الفئة: المتابعة والتقييم/)).toBeInTheDocument();
  });

  it("an empty history says so", async () => {
    mockFetch(base({ "GET /api/employees": { data: [{ id: 21, name: "جلال", email: "j@org.org", role: null, status: "active" }] }, "GET /api/roles": { data: [] }, "GET /api/employees/21/audit": { data: [] } }));
    shell(<EmployeesPage />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "سجل دور جلال" }));
    expect(await screen.findByText(/لم يُسجَّل أي تغيير/)).toBeInTheDocument();
  });
});

describe("settings: the select lists", () => {
  it("the admin edits a list (one value per line) and saves it with PUT /options/{kind}", async () => {
    const m = mockFetch(base({ "PUT /api/options/departments": json({ data: ["المالية", "الأمن"] }) }));
    renderWithProviders(<SettingsPage />);
    const user = userEvent.setup();
    const box = await screen.findByLabelText("الأقسام");
    expect(box).toHaveValue("المالية\nالعمليات");
    const save = screen.getByRole("button", { name: "حفظ القائمة" });
    expect(save).toBeDisabled(); // nothing changed yet
    await user.clear(box);
    await user.type(box, "المالية{Enter}الأمن{Enter}المالية{Enter}"); // blank lines and repeats are dropped
    await user.click(save);
    await waitFor(() => expect(calls(m, "PUT", "/api/options/departments")[0].body).toEqual({ values: ["المالية", "الأمن"] }));
  });

  it("other lists have their own tab", async () => {
    mockFetch(base({ "GET /api/options": { data: { departments: [], regions: ["غزة", "رفح"] } } }));
    renderWithProviders(<SettingsPage />);
    await userEvent.setup().click(await screen.findByRole("tab", { name: "المناطق" }));
    expect(await screen.findByLabelText("المناطق")).toHaveValue("غزة\nرفح");
  });

  it("without settings.manage the screen is closed", async () => {
    mockFetch(base({ "GET /api/auth/session": sessionOf(["projects.view"]) }));
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText(/لمدير النظام فقط/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "الأقسام" })).not.toBeInTheDocument();
  });
});

describe("folders and reports on the general pages", () => {
  const PROJECTS = { "GET /api/projects": { data: [{ id: 5, name: "مشروع المياه", status: "active" }], meta: { total: 1 } } };
  const FILES = { ...PROJECTS, "GET /api/files/folders": { data: [{ id: 1, name: "العقود", project_id: 5, items_count: 0 }] }, "GET /api/files": { data: [], meta: { total: 0 } } };

  it("files.upload creates a folder inside a project (the project is mandatory)", async () => {
    const m = mockFetch(base({ ...FILES, "POST /api/files/folders": json({ data: { id: 2, name: "الموازنات", project_id: 5, items_count: 0 } }, { status: 201 }) }));
    renderWithProviders(<FilesPage />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("اسم المجلد الجديد"), "الموازنات");
    expect(screen.getByRole("button", { name: "إنشاء مجلد" })).toBeDisabled(); // no project chosen yet
    await within(await screen.findByLabelText("مشروع المجلد")).findByRole("option", { name: "مشروع المياه" });
    await user.selectOptions(screen.getByLabelText("مشروع المجلد"), "5");
    await user.click(screen.getByRole("button", { name: "إنشاء مجلد" }));
    await waitFor(() => expect(calls(m, "POST", "/api/files/folders")[0].body).toEqual({ name: "الموازنات", project_id: 5 }));
  });

  it("a file is uploaded into a folder: the upload button waits for one and sends folder_id", async () => {
    const m = mockFetch(base({ ...FILES, "POST /api/files": json({ data: { id: 3, name: "a.pdf", folder_id: 1 } }, { status: 201 }) }));
    renderWithProviders(<FilesPage />);
    const user = userEvent.setup();
    expect(await screen.findByRole("button", { name: /اختر مجلداً لرفع ملف/ })).toBeDisabled();
    await user.click(await screen.findByRole("button", { name: /العقود/ }));
    const button = await screen.findByRole("button", { name: "رفع ملف جديد" });
    expect(button).toBeEnabled();
    await user.upload(document.querySelector("input[type=file]"), new File(["x"], "a.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(calls(m, "POST", "/api/files")).toHaveLength(1));
    expect(calls(m, "POST", "/api/files")[0].init.body.get("folder_id")).toBe("1");
  });

  it("no folder form without files.upload", async () => {
    mockFetch(base({ ...FILES, "GET /api/auth/session": sessionOf(["files.view"]) }));
    renderWithProviders(<FilesPage />);
    await screen.findByText("العقود");
    await waitFor(() => expect(screen.queryByLabelText("اسم المجلد الجديد")).not.toBeInTheDocument());
  });

  const REPORTS = { "GET /api/projects": { data: [{ id: 5, name: "مشروع المياه", status: "active" }], meta: { total: 1 } }, "GET /api/reports/summary": { data: { total_reports: 0, monthly_progress: 0, active_sections: 1 } }, "GET /api/reports": { data: [], meta: { total: 0 } } };

  it("reports.manage uploads a report as multipart; a viewer has no upload button", async () => {
    const m = mockFetch(base({ ...REPORTS, "POST /api/reports": json({ data: { id: 9, name: "q1" } }, { status: 201 }) }));
    const first = renderWithProviders(<ReportsPage />);
    const file = new File(["%PDF-1.4"], "q1.pdf", { type: "application/pdf" });
    const user = userEvent.setup();
    expect(await screen.findByRole("button", { name: /رفع تقرير/ })).toBeDisabled(); // a report belongs to a project: pick one first
    await within(await screen.findByLabelText("مشروع التقرير")).findByRole("option", { name: "مشروع المياه" });
    await user.selectOptions(screen.getByLabelText("مشروع التقرير"), "5");
    expect(screen.getByRole("button", { name: /رفع تقرير/ })).toBeEnabled();
    await user.upload(await screen.findByLabelText("ملف التقرير"), file);
    await waitFor(() => expect(calls(m, "POST", "/api/reports")).toHaveLength(1));
    expect(calls(m, "POST", "/api/reports")[0].init.body).toBeInstanceOf(FormData);
    expect(calls(m, "POST", "/api/reports")[0].init.body.get("file").name).toBe("q1.pdf");
    expect(calls(m, "POST", "/api/reports")[0].init.body.get("project_id")).toBe("5");
    first.unmount();

    mockFetch(base({ ...REPORTS, "GET /api/auth/session": sessionOf(["reports.view"]) }));
    renderWithProviders(<ReportsPage />);
    await screen.findByText("التقارير والإحصائيات");
    await waitFor(() => expect(screen.queryByRole("button", { name: /رفع تقرير/ })).not.toBeInTheDocument());
  });
});

describe("login: a blocked organization", () => {
  const attempt = async (body) => {
    mockFetch({ "POST /api/auth/login": json(body, { status: 403 }) });
    renderWithProviders(<LoginForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("البريد الإلكتروني"), "a@org.org");
    await user.type(screen.getByLabelText("كلمة المرور"), "Passw0rd!");
    await user.click(screen.getByRole("button", { name: /دخول الآن/ }));
    return screen.findByRole("alert");
  };

  it("suspended: says so, with the reason the operator gave", async () => {
    const alert = await attempt({ message: "حساب المنظمة معلّق أو مرفوض، تواصل مع الدعم.", organization_status: "suspended", reason: "مخالفة الشروط" });
    expect(alert).toHaveTextContent("تم تعليق حساب منظمتك");
    expect(alert).toHaveTextContent("السبب: مخالفة الشروط");
  });

  it("rejected: says so and points to the way forward; no reason is handled too", async () => {
    const alert = await attempt({ message: "x", organization_status: "rejected", reason: null });
    expect(alert).toHaveTextContent("تم رفض طلب تسجيل منظمتك");
    expect(alert).toHaveTextContent("لم يُذكر سبب");
    expect(alert).toHaveTextContent("بعد معالجة الملاحظات");
  });

  it("other 403s keep the server's own message", async () => {
    const alert = await attempt({ message: "هذا الحساب غير نشط، تواصل مع مدير النظام." });
    expect(alert).toHaveTextContent("هذا الحساب غير نشط");
    expect(alert).not.toHaveTextContent("تم تعليق");
  });
});
