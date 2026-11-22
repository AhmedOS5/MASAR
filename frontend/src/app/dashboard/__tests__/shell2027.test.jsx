// @vitest-environment jsdom
// Shell additions: collapsible sidebar (persisted), breadcrumbs, employee figures/filters.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockFetch } from "@/test/helpers";
import { renderWithProviders } from "@/test/render";

const router = { push: vi.fn(), replace: vi.fn() };
let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));

import { NotificationsProvider } from "@/app/dashboard/_context/NotificationsContext";
import DashboardLayout from "@/app/dashboard/layout";
import Breadcrumbs from "@/app/dashboard/_components/Breadcrumbs";
import EmployeesPage from "@/app/dashboard/employees/page";

const SESSION = { user: { name: "ليلى المحمود", role: "مديرة", is_platform_admin: false }, organization: { name: "منظمة النور" } };
const EMPLOYEES = {
  data: [
    { id: 1, name: "جلال العمر", email: "jalal@org.org", role: { id: 1, title: "باحث" }, department: "العمليات", status: "active" },
    { id: 2, name: "منى سالم", email: "mona@org.org", role: null, department: "المالية", status: "inactive" },
    { id: 3, name: "ريما الحلبي", email: "rima@org.org", role: null, department: "المالية", status: "active", invite_pending: true },
  ],
};
const routes = (extra = {}) =>
  mockFetch({
    "GET /api/auth/session": SESSION,
    "GET /api/notifications": { data: [] },
    "GET /api/options": { departments: ["العمليات", "المالية"] },
    "GET /api/roles": { data: [{ id: 1, title: "باحث" }] },
    "GET /api/employees": EMPLOYEES,
    ...extra,
  });

beforeEach(() => {
  pathname = "/dashboard";
  localStorage.clear();
  Object.values(router).forEach((f) => f.mockClear());
});
afterEach(() => vi.unstubAllGlobals());

describe("collapsible sidebar", () => {
  const layout = () =>
    renderWithProviders(
      <DashboardLayout>
        <p>محتوى الصفحة</p>
      </DashboardLayout>,
    );

  it("collapses to the icon rail, remembers it, and expands again", async () => {
    routes();
    layout();
    const user = userEvent.setup();
    const collapse = await screen.findByRole("button", { name: "طي القائمة الجانبية" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    await user.click(collapse);
    const expand = screen.getByRole("button", { name: "توسيع القائمة الجانبية" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(localStorage.getItem("masar-sidebar")).toBe("collapsed");
    // every destination is still a named link (labels become tooltips, they are not removed)
    expect(screen.getByRole("link", { name: "الموظفون" })).toHaveAttribute("href", "/dashboard/employees");

    await user.click(expand);
    expect(localStorage.getItem("masar-sidebar")).toBe("open");
  });

  it("starts collapsed when that was the saved choice", async () => {
    localStorage.setItem("masar-sidebar", "collapsed");
    routes();
    layout();
    expect(await screen.findByRole("button", { name: "توسيع القائمة الجانبية" })).toBeInTheDocument();
  });
});

describe("breadcrumbs", () => {
  it("shows only the current page on the dashboard home", () => {
    renderWithProviders(<Breadcrumbs />);
    const nav = within(screen.getByRole("navigation", { name: "مسار التنقل" }));
    expect(nav.getByText("لوحة التحكم")).toHaveAttribute("aria-current", "page");
    expect(nav.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links every step but the last, and names record pages 'التفاصيل'", () => {
    pathname = "/dashboard/requests/15";
    renderWithProviders(<Breadcrumbs />);
    const nav = within(screen.getByRole("navigation", { name: "مسار التنقل" }));
    expect(nav.getByRole("link", { name: "لوحة التحكم" })).toHaveAttribute("href", "/dashboard");
    expect(nav.getByRole("link", { name: "الطلبات" })).toHaveAttribute("href", "/dashboard/requests");
    expect(nav.getByText("التفاصيل")).toHaveAttribute("aria-current", "page");
  });

  it("renders nothing outside the workspace", () => {
    pathname = "/operator";
    renderWithProviders(<Breadcrumbs />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("employees: figures and filters", () => {
  const page = () => renderWithProviders(<NotificationsProvider><EmployeesPage /></NotificationsProvider>);
  const tile = (name) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

  it("counts come from the listed employees and each figure filters the cards", async () => {
    routes();
    page();
    await screen.findByText("جلال العمر");
    expect(tile("إجمالي الموظفين")).toHaveTextContent("3");
    expect(tile("نشطون")).toHaveTextContent("2");
    expect(tile("غير نشطين")).toHaveTextContent("1");
    expect(tile("دعوات معلّقة")).toHaveTextContent("1");

    const user = userEvent.setup();
    await user.click(tile("غير نشطين"));
    expect(tile("غير نشطين")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("منى سالم")).toBeInTheDocument();
    expect(screen.queryByText("جلال العمر")).not.toBeInTheDocument();

    await user.click(tile("دعوات معلّقة"));
    expect(screen.getByText("ريما الحلبي")).toBeInTheDocument();
    expect(screen.queryByText("منى سالم")).not.toBeInTheDocument();
  });

  it("searches by name, e-mail or department and offers a way back when nothing matches", async () => {
    routes();
    page();
    await screen.findByText("جلال العمر");
    const user = userEvent.setup();
    const search = screen.getByRole("searchbox", { name: "بحث في الموظفين" });

    await user.type(search, "المالية");
    expect(screen.getByText("منى سالم")).toBeInTheDocument();
    expect(screen.getByText("ريما الحلبي")).toBeInTheDocument();
    expect(screen.queryByText("جلال العمر")).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "لا أحد");
    expect(screen.getByText("لا يوجد موظفون مطابقون لعوامل التصفية الحالية.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "مسح عوامل التصفية" }));
    expect(screen.getByText("جلال العمر")).toBeInTheDocument();
    expect(search).toHaveValue("");
  });
});
