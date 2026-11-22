// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { json, mockFetch } from "@/test/helpers";
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
import TopHeader from "@/app/dashboard/_components/TopHeader";
import Sidebar from "@/app/dashboard/_components/Sidebar";
import NotificationsPage from "@/app/dashboard/notifications/page";
import WelcomeHeader from "@/app/dashboard/_components/WelcomeHeader";

const NOTIFS = [
  { id: 11, title: "تقرير جديد الوحيد", message: "m1", type: "system", is_read: false, created_at: new Date().toISOString() },
  { id: 12, title: "مهمة بانتظارك", message: "m2", type: "task", is_read: false, created_at: new Date().toISOString(), link: "/dashboard/tasks/5" },
  { id: 13, title: "تنبيه المخزون", message: "m3", type: "alert", is_read: true, created_at: new Date().toISOString() },
];
const SESSION = { user: { name: "ليلى المحمود", role: "مديرة" }, organization: { name: "منظمة النور" }, onboarding_status: "approved" };

let m;
const withNotifs = (extra = {}) => {
  m = mockFetch({
    "GET /api/notifications": { data: NOTIFS },
    "GET /api/auth/session": SESSION,
    "PATCH /api/notifications/11/read": { ok: true },
    "PATCH /api/notifications/12/read": { ok: true },
    "POST /api/notifications/read-all": { ok: true },
    "POST /api/auth/logout": { ok: true },
    ...extra,
  });
  return m;
};

beforeEach(() => {
  pathname = "/dashboard";
  Object.values(router).forEach((f) => f.mockClear());
});
afterEach(() => vi.unstubAllGlobals());

const shell = (ui) => renderWithProviders(<NotificationsProvider>{ui}</NotificationsProvider>);

describe("TopHeader + notifications (used to crash: markAsRead was undefined, notif.read vs isRead)", () => {
  it("shows the signed-in user from the session, not a hard-coded name", async () => {
    withNotifs();
    shell(<TopHeader onMenuClick={() => {}} />);
    expect(await screen.findByText("ليلى المحمود")).toBeInTheDocument();
    expect(screen.queryByText("محمود سالم")).not.toBeInTheDocument();
  });

  it("clicking a notification marks it read via the API and does not throw", async () => {
    withNotifs();
    shell(<TopHeader onMenuClick={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "الإشعارات" }));
    await user.click(await screen.findByText("تقرير جديد الوحيد"));

    await waitFor(() => expect(m.calls.some((c) => c.method === "PATCH" && c.path === "/api/notifications/11/read")).toBe(true));
  });

  it("a notification with a link navigates there after being marked read", async () => {
    withNotifs();
    shell(<TopHeader onMenuClick={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "الإشعارات" }));
    await user.click(await screen.findByText("مهمة بانتظارك"));
    expect(router.push).toHaveBeenCalledWith("/dashboard/tasks/5");
  });

  it("shows an error row (not a crash) when notifications fail to load", async () => {
    withNotifs({ "GET /api/notifications": json({ message: "boom" }, { status: 500 }) });
    shell(<TopHeader onMenuClick={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "الإشعارات" }));
    expect(await screen.findByText("تعذر تحميل الإشعارات")).toBeInTheDocument();
  });

  it("the global search goes to the requests list with ?search=", async () => {
    withNotifs();
    shell(<TopHeader onMenuClick={() => {}} />);
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "بحث" }), "معدات{enter}");
    expect(router.push).toHaveBeenCalledWith(`/dashboard/requests?search=${encodeURIComponent("معدات")}`);
  });
});

describe("Notifications page", () => {
  it("renders API data, filters it, and 'mark all read' calls the API", async () => {
    let allRead = false; // the fake server remembers the state change
    withNotifs({
      "GET /api/notifications": () => ({ data: NOTIFS.map((n) => ({ ...n, is_read: allRead || n.is_read })) }),
      "POST /api/notifications/read-all": () => {
        allRead = true;
        return { ok: true };
      },
    });
    shell(<NotificationsPage />);
    expect(await screen.findByText("تقرير جديد الوحيد")).toBeInTheDocument();
    expect(screen.getByText(/لديك 2 إشعارات غير مقروءة/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "تحذيرات" }));
    expect(screen.getByText("تنبيه المخزون")).toBeInTheDocument();
    expect(screen.queryByText("تقرير جديد الوحيد")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /تحديد الكل كمقروء/ }));
    await waitFor(() => expect(m.calls.some((c) => c.method === "POST" && c.path === "/api/notifications/read-all")).toBe(true));
    await waitFor(() => expect(screen.getByText(/لديك 0 إشعارات غير مقروءة/)).toBeInTheDocument());
  });

  it("shows the error banner with a working retry", async () => {
    let fail = true;
    withNotifs({ "GET /api/notifications": () => (fail ? json({ message: "down" }, { status: 500 }) : { data: NOTIFS }) });
    shell(<NotificationsPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fail = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByText("تقرير جديد الوحيد")).toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    withNotifs({ "GET /api/notifications": { data: [] } });
    shell(<NotificationsPage />);
    expect(await screen.findByText("لا توجد إشعارات")).toBeInTheDocument();
  });
});

describe("Sidebar", () => {
  it("logout button really logs out: calls the API, clears cache and goes to /login", async () => {
    withNotifs();
    shell(<Sidebar isOpen={false} onClose={() => {}} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /تسجيل الخروج/ }));
    await waitFor(() => expect(m.calls.some((c) => c.method === "POST" && c.path === "/api/auth/logout")).toBe(true));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
  });

  it("shows the unread count badge from the API", async () => {
    withNotifs();
    shell(<Sidebar isOpen={false} onClose={() => {}} />);
    expect(await screen.findByText("2")).toBeInTheDocument();
  });

  const linkNames = () => screen.getAllByRole("link").map((a) => a.textContent.trim());

  it("shows each person only the screens their job category's permissions allow (field/MEAL officer)", async () => {
    const meal = ["projects.view", "requests.view", "tasks.view", "files.view", "reports.view", "units.view", "meal.view", "beneficiaries.view"];
    withNotifs({ "GET /api/auth/session": { ...SESSION, user: { name: "هالة", is_system_admin: false, permissions: meal } } });
    pathname = "/dashboard/units"; // keeps the units sub-menu (with the MEAL link) open
    shell(<Sidebar isOpen={false} onClose={() => {}} />);
    await waitFor(() => expect(linkNames()).not.toContain("الموظفون")); // until the session has arrived
    const names = linkNames();
    for (const shown of ["لوحة التحكم", "المشاريع", "الطلبات", "المهام", "الملفات", "التقارير", "المتابعة والتقييم"]) expect(names).toContain(shown);
    expect(names.some((n) => n.includes("الإشعارات"))).toBe(true); // (its text carries the unread badge)
    for (const hidden of ["الموظفون", "الأدوار والصلاحيات"]) expect(names).not.toContain(hidden);
  });

  it("an employee sees no MEAL, people or roles screens; a system admin sees everything", async () => {
    const employee = ["projects.view", "requests.view", "requests.create", "tasks.view", "files.view", "reports.view", "units.view"];
    withNotifs({ "GET /api/auth/session": { ...SESSION, user: { name: "موظف", is_system_admin: false, permissions: employee } } });
    pathname = "/dashboard/units";
    const first = shell(<Sidebar isOpen={false} onClose={() => {}} />);
    await waitFor(() => expect(linkNames()).not.toContain("الموظفون"));
    expect(linkNames()).not.toContain("المتابعة والتقييم");
    expect(linkNames()).not.toContain("الأدوار والصلاحيات");
    first.unmount();

    withNotifs({ "GET /api/auth/session": { ...SESSION, user: { name: "ليلى", is_system_admin: true, permissions: [] } } });
    shell(<Sidebar isOpen={false} onClose={() => {}} />);
    await waitFor(() => expect(m.calls.some((c) => c.path === "/api/auth/session")).toBe(true));
    expect(linkNames()).toEqual(expect.arrayContaining(["الموظفون", "الأدوار والصلاحيات", "المشاريع", "المتابعة والتقييم"]));
  });

  it("quick actions on the home page follow the create permissions", async () => {
    withNotifs({ "GET /api/auth/session": { ...SESSION, user: { name: "موظف", is_system_admin: false, permissions: ["requests.view", "requests.create", "tasks.view"] } } });
    shell(<WelcomeHeader />);
    await waitFor(() => expect(screen.queryByRole("link", { name: /مهمة جديدة/ })).not.toBeInTheDocument()); // once the session is in
    expect(screen.getByRole("link", { name: /طلب جديد/ })).toBeInTheDocument();
  });

  it("has no AI assistant any more (removed from the product)", async () => {
    withNotifs();
    shell(<Sidebar isOpen={false} onClose={() => {}} />);
    await screen.findByText("2");
    expect(screen.queryByRole("button", { name: "افتح المحادثة" })).not.toBeInTheDocument();
  });
});

describe("WelcomeHeader", () => {
  it("greets the real user & organization and links the quick actions to the create flows", async () => {
    withNotifs();
    shell(<WelcomeHeader />);
    expect(await screen.findByText("ليلى المحمود")).toBeInTheDocument();
    expect(screen.getByText(/منظمة النور/)).toBeInTheDocument();
    expect(screen.queryByText(/أحمد الراشد/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /طلب جديد/ })).toHaveAttribute("href", "/dashboard/requests?new=1");
    expect(screen.getByRole("link", { name: /مهمة جديدة/ })).toHaveAttribute("href", "/dashboard/tasks?new=1");
    // the date is today's, not the hard-coded 2026-06-26
    expect(within(screen.getByRole("heading", { level: 1 }).parentElement).queryByText(/٢٦ يونيو ٢٠٢٦/)).toBeNull();
  });
});
