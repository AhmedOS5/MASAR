// @vitest-environment jsdom
// The job-category field of the employee form and the last action buttons that follow the person's permission package.
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
import { TaskSummary } from "@/app/dashboard/tasks/[id]/_components/TaskSummary";
import IndicatorsTable from "@/app/dashboard/meal/indicators/_components/IndicatorsTable";
import ReportsTable from "@/app/dashboard/meal/reports/_components/ReportsTable";

afterEach(() => vi.unstubAllGlobals());

const session = (permissions, extra = {}) => ({
  user: { id: 5, name: "سارة", is_system_admin: false, permissions, ...extra },
  organization: { name: "منظمة" },
  onboarding_status: "approved",
});
const ADMIN = { user: { id: 1, name: "ليلى", is_system_admin: true, permissions: [] }, organization: { name: "منظمة" }, onboarding_status: "approved" };
const shell = (ui) => renderWithProviders(<NotificationsProvider>{ui}</NotificationsProvider>);

const CATEGORIES = {
  data: [
    { key: "manager", label: "الإدارة والإشراف على المشاريع", role_title: "مدير", view: ["a", "b", "c"], edit: ["d", "e"], permissions: [] },
    { key: "meal", label: "المتابعة والتقييم والعمل الميداني", role_title: "مسؤول متابعة وتقييم", view: ["a", "b"], edit: ["d", "e", "f"], permissions: [] },
  ],
};
const ROLES = { data: [{ id: 1, title: "مسؤول متابعة وتقييم" }, { id: 2, title: "مراجع" }] };
const EMPLOYEE = { id: 21, name: "جلال العمر", email: "jalal@org.org", role: { id: 1, title: "مسؤول متابعة وتقييم" }, role_source: "auto", job_title: "باحث ميداني", job_category: "meal", department: "ميداني", status: "active" };
const calls = (m, method, path) => m.calls.filter((c) => c.method === method && c.path === path);

const employeeRoutes = (extra = {}) => ({
  "GET /api/auth/session": ADMIN,
  "GET /api/options": { data: { departments: ["ميداني"] } },
  "GET /api/notifications": { data: [] },
  "GET /api/employees": { data: [EMPLOYEE] },
  "GET /api/roles": ROLES,
  "GET /api/job-categories": CATEGORIES,
  ...extra,
});

describe("employee form: job category", () => {
  it("shows the role's origin on the card: «تلقائي» for an automatic one", async () => {
    mockFetch(employeeRoutes());
    shell(<EmployeesPage />);
    expect(await screen.findByText("جلال العمر")).toBeInTheDocument();
    expect(screen.getByText(/تلقائي/)).toBeInTheDocument();
  });

  it("a new employee: pick the category (preview of the package), the title is optional, the role stays empty → POST with job_category and no role", async () => {
    const m = mockFetch(employeeRoutes({ "POST /api/employees": json({ data: { ...EMPLOYEE, id: 22, invite_pending: true } }, { status: 201 }) }));
    shell(<EmployeesPage />);
    const user = userEvent.setup();
    await screen.findByText("جلال العمر");
    await user.click(screen.getByRole("button", { name: /إضافة موظف جديد/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/الاسم/), "ريما");
    await user.type(within(dialog).getByLabelText(/البريد الإلكتروني/), "rima@org.org");
    await user.type(within(dialog).getByLabelText("المسمى الوظيفي"), "باحثة ميدانية");
    await user.selectOptions(await within(dialog).findByRole("combobox", { name: "الفئة الوظيفية" }), "meal");
    expect(within(dialog).getByText(/الدور التلقائي/)).toHaveTextContent("مسؤول متابعة وتقييم"); // the automatic role
    expect(within(dialog).getByText(/2 صلاحية اطلاع و3 صلاحية تعديل/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "إضافة" }));
    await waitFor(() => expect(calls(m, "POST", "/api/employees")[0].body).toMatchObject({ name: "ريما", job_title: "باحثة ميدانية", job_category: "meal", role_id: null }));
  });

  it("with only a title (no category picked) no job_category is sent, so the server derives it from the title", async () => {
    const m = mockFetch(employeeRoutes({ "POST /api/employees": json({ data: EMPLOYEE }, { status: 201 }) }));
    shell(<EmployeesPage />);
    const user = userEvent.setup();
    await screen.findByText("جلال العمر");
    await user.click(screen.getByRole("button", { name: /إضافة موظف جديد/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/الاسم/), "ريما");
    await user.type(within(dialog).getByLabelText(/البريد الإلكتروني/), "rima@org.org");
    await user.type(within(dialog).getByLabelText("المسمى الوظيفي"), "محاسب");
    await user.click(within(dialog).getByRole("button", { name: "إضافة" }));
    await waitFor(() => expect(calls(m, "POST", "/api/employees")).toHaveLength(1));
    const body = calls(m, "POST", "/api/employees")[0].body;
    expect(body.job_title).toBe("محاسب");
    expect(body).not.toHaveProperty("job_category");
  });

  it("editing: an unchanged role is NOT re-sent (it would pin it as manual); a changed role is", async () => {
    const m = mockFetch(employeeRoutes({ "PUT /api/employees/21": json({ data: EMPLOYEE }) }));
    shell(<EmployeesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "تعديل جلال العمر" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("المسمى الوظيفي")).toHaveValue("باحث ميداني");
    await user.selectOptions(await within(dialog).findByRole("combobox", { name: "الفئة الوظيفية" }), "manager");
    await user.click(within(dialog).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(calls(m, "PUT", "/api/employees/21")).toHaveLength(1));
    let body = calls(m, "PUT", "/api/employees/21")[0].body;
    expect(body).toMatchObject({ job_category: "manager" });
    expect(body).not.toHaveProperty("role_id");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "تعديل جلال العمر" }));
    dialog = await screen.findByRole("dialog");
    await user.selectOptions(await within(dialog).findByRole("combobox", { name: "الدور" }), "2");
    await user.click(within(dialog).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(calls(m, "PUT", "/api/employees/21")).toHaveLength(2));
    body = calls(m, "PUT", "/api/employees/21")[1].body;
    expect(body.role_id).toBe("2");
  });

  it("the form still works when the catalog cannot be loaded", async () => {
    const m = mockFetch(employeeRoutes({ "GET /api/job-categories": json({ message: "x" }, { status: 500 }), "POST /api/employees": json({ data: EMPLOYEE }, { status: 201 }) }));
    shell(<EmployeesPage />);
    const user = userEvent.setup();
    await screen.findByText("جلال العمر");
    await user.click(screen.getByRole("button", { name: /إضافة موظف جديد/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/الاسم/), "ريما");
    await user.type(within(dialog).getByLabelText(/البريد الإلكتروني/), "rima@org.org");
    await user.click(within(dialog).getByRole("button", { name: "إضافة" }));
    await waitFor(() => expect(calls(m, "POST", "/api/employees")).toHaveLength(1));
  });
});

describe("the last action buttons follow the package", () => {
  const TASK = { id: 3, code: "TSK-003", title: "مهمة", status: "todo", priority: "medium", assignee_id: 5, assignee: { id: 5, name: "سارة" } };

  it("task page: the assignee reports status but cannot edit; someone else who only views sees neither; tasks.update edits", async () => {
    mockFetch({ "GET /api/auth/session": session(["tasks.view"]), "GET /api/options": { data: {} } });
    const first = shell(<TaskSummary task={TASK} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "تعديل" })).not.toBeInTheDocument()); // once the session is in
    expect(screen.getByText("تحديث الحالة")).toBeInTheDocument();
    first.unmount();

    mockFetch({ "GET /api/auth/session": session(["tasks.view"], { id: 9 }), "GET /api/options": { data: {} } });
    shell(<TaskSummary task={TASK} />);
    await waitFor(() => expect(screen.queryByText("تحديث الحالة")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "تعديل" })).not.toBeInTheDocument();
  });

  it("task page: tasks.update shows the edit button", async () => {
    mockFetch({ "GET /api/auth/session": session(["tasks.view", "tasks.update"], { id: 9 }), "GET /api/options": { data: {} } });
    shell(<TaskSummary task={TASK} />);
    expect(await screen.findByRole("button", { name: "تعديل" })).toBeInTheDocument();
    expect(screen.getByText("تحديث الحالة")).toBeInTheDocument();
  });

  const indicators = { isPending: false, isError: false, data: { items: [{ id: 1, code: "IND-1", name: "مؤشر", target: 10, achieved: 5, status: "on_track" }], meta: {} } };

  it("MEAL tables: only meal.manage gets the row menu; viewers see the data without actions", async () => {
    mockFetch({ "GET /api/auth/session": session(["meal.view"]), "GET /api/notifications": { data: [] } });
    const first = shell(<IndicatorsTable query={indicators} page={1} onPageChange={() => {}} onEdit={() => {}} />);
    expect(await screen.findByText("مؤشر")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: /خيارات|إجراءات|القائمة/ })).not.toBeInTheDocument());
    expect(document.querySelectorAll("tbody button")).toHaveLength(0);
    first.unmount();

    mockFetch({ "GET /api/auth/session": session(["meal.view", "meal.manage"]), "GET /api/notifications": { data: [] } });
    shell(<IndicatorsTable query={indicators} page={1} onPageChange={() => {}} onEdit={() => {}} />);
    await waitFor(() => expect(document.querySelectorAll("tbody button").length).toBeGreaterThan(0));
  });

  it("MEAL reports: a viewer can still download but cannot change the status", async () => {
    const reports = { isPending: false, isError: false, data: { items: [{ id: 2, title: "تقرير", type: "ربعي", project: "م", status: "draft", owner: { name: "س" }, updated_at: new Date().toISOString() }], meta: {} } };
    mockFetch({ "GET /api/auth/session": session(["meal.view"]), "GET /api/notifications": { data: [] } });
    const user = userEvent.setup();
    shell(<ReportsTable query={reports} page={1} onPageChange={() => {}} />);
    await screen.findByText("تقرير");
    await waitFor(() => expect(document.querySelectorAll("tbody button").length).toBe(1));
    await user.click(document.querySelector("tbody button"));
    expect(await screen.findByRole("menuitem", { name: "تحميل PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /تحويل إلى/ })).not.toBeInTheDocument();
  });
});
