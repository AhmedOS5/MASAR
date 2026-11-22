// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockFetch } from "@/test/helpers";
import { renderWithProviders } from "@/test/render";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));

import OperatorPage from "@/app/operator/page";
import DashboardLayout from "@/app/dashboard/layout";

beforeEach(() => Object.values(router).forEach((f) => f.mockClear()));
afterEach(() => vi.unstubAllGlobals());

const OPS = { user: { name: "فريق مسار", is_platform_admin: true, onboarding_status: "approved" }, organization: null };
const ORG_ADMIN = { user: { name: "ليلى", is_platform_admin: false, onboarding_status: "approved" }, organization: { name: "منظمة النور" } };

const STATS = {
  data: {
    organizations: { total: 3, by_status: { incomplete: 0, pending_approval: 1, approved: 1, rejected: 0, suspended: 1 } },
    employees: { total: 12, active: 9 },
    beneficiaries_reached: 7,
    health: { status: "ok", database: "ok", uptime_seconds: 60, checked_at: "2026-05-01T10:00:00.000Z" },
  },
};
const ORGS = [
  { id: 1, name: "منظمة النور", type: "ngo", status: "approved", region: "رام الله", employees_count: 5, beneficiaries_reached: 3, created_at: "2026-01-10T08:00:00.000Z", admin: { name: "ليلى", email: "leila@alnoor.org" } },
  { id: 2, name: "جمعية الأمل", type: "ngo", status: "pending_approval", region: "نابلس", employees_count: 2, beneficiaries_reached: 0, created_at: "2026-03-02T08:00:00.000Z", admin: { name: "سامر", email: "samer@alamal.org" } },
  { id: 3, name: "مؤسسة الغد", type: "gov", status: "suspended", region: "غزة", employees_count: 5, beneficiaries_reached: 4, created_at: "2025-11-20T08:00:00.000Z", admin: { name: "هدى", email: "huda@alghad.org" } },
];
const page = (data) => ({ data, meta: { total: data.length, current_page: 1, last_page: 1 } });
const DETAIL = {
  data: {
    ...ORGS[1],
    email: "contact@alamal.org",
    phone: "+970 59 222 3333",
    employees_count: 2,
    beneficiaries_reached: 0,
    profile: null,
    documents: [{ id: 9, name: "رخصة.pdf", size: 2048, mime: "application/pdf", created_at: "2026-03-02T08:00:00.000Z" }],
    admin_accounts: [
      { id: 20, name: "سامر", email: "samer@alamal.org", status: "active", verified: false, verified_at: null, has_password: true, last_login_at: null,
        code: { active: true, kind: "verification", sent_at: "2026-05-01T09:00:00.000Z", expires_at: "2026-05-01T09:15:00.000Z", attempts: 1 } },
    ],
  },
};
const consoleRoutes = (extra = {}) => ({
  "GET /api/auth/session": OPS,
  "GET /api/platform/stats": STATS,
  "GET /api/platform/organizations": page(ORGS),
  "GET /api/platform/organizations/2": DETAIL,
  ...extra,
});

describe("operator console (the only screen of a platform operator)", () => {
  it("greets the operator and shows the platform-wide figures", async () => {
    mockFetch(consoleRoutes());
    renderWithProviders(<OperatorPage />);
    expect(screen.getByRole("heading", { level: 1, name: "حساب مشغّل المنصة" })).toBeInTheDocument();
    expect(await screen.findByText(/أهلاً فريق مسار/)).toBeInTheDocument();
    const kpis = within(await screen.findByRole("region", { name: "الإحصائيات الشاملة" }));
    expect(await kpis.findByText("المؤسسات النشطة")).toBeInTheDocument();
    expect(kpis.getByText("الموظفون في كل المؤسسات")).toBeInTheDocument();
    expect(kpis.getByText("المستفيدون")).toBeInTheDocument();
    expect(kpis.getByText("تعمل بشكل طبيعي")).toBeInTheDocument();
  });

  it("lists every organization with its state and the one action that fits that state", async () => {
    mockFetch(consoleRoutes());
    renderWithProviders(<OperatorPage />);
    const table = within(await screen.findByRole("table"));
    expect(table.getByText("منظمة النور")).toBeInTheDocument();
    expect(table.getByText("جمعية الأمل")).toBeInTheDocument();
    expect(table.getByRole("button", { name: "تعليق منظمة النور" })).toBeInTheDocument();
    expect(table.getByRole("button", { name: "اعتماد جمعية الأمل" })).toBeInTheDocument();
    expect(table.getByRole("button", { name: "تفعيل مؤسسة الغد" })).toBeInTheDocument();
  });

  it("filters by status through the API", async () => {
    const m = mockFetch(consoleRoutes());
    renderWithProviders(<OperatorPage />);
    await screen.findByRole("table");
    await userEvent.setup().click(screen.getByRole("button", { name: /بانتظار الاعتماد/ }));
    await waitFor(() =>
      expect(m.calls.some((c) => c.path === "/api/platform/organizations" && c.url.includes("status=pending_approval"))).toBe(true),
    );
  });

  it("shows an empty state with a way back when no organization matches", async () => {
    mockFetch(consoleRoutes({ "GET /api/platform/organizations": page([]) }));
    renderWithProviders(<OperatorPage />);
    expect(await screen.findByText("لا توجد مؤسسات مسجلة في المنصة بعد.")).toBeInTheDocument();
  });

  it("approves a pending organization after confirmation", async () => {
    const m = mockFetch(consoleRoutes({ "POST /api/platform/organizations/2/approve": { data: { id: 2, status: "approved" } } }));
    renderWithProviders(<OperatorPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "اعتماد جمعية الأمل" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(m.calls.some((c) => c.method === "POST")).toBe(false); // nothing happens before the confirmation
    await user.click(dialog.getByRole("button", { name: "اعتماد" }));
    await waitFor(() => expect(m.calls.some((c) => c.method === "POST" && c.path === "/api/platform/organizations/2/approve")).toBe(true));
  });

  it("suspends with an optional reason", async () => {
    const m = mockFetch(consoleRoutes({ "POST /api/platform/organizations/1/suspend": { data: { id: 1, status: "suspended" } } }));
    renderWithProviders(<OperatorPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "تعليق منظمة النور" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByRole("textbox"), "مخالفة الشروط");
    await user.click(dialog.getByRole("button", { name: "تعليق المؤسسة" }));
    await waitFor(() => {
      const call = m.calls.find((c) => c.method === "POST" && c.path === "/api/platform/organizations/1/suspend");
      expect(call?.body).toEqual({ reason: "مخالفة الشروط" });
    });
  });

  it("inspects the admin's verification state without ever showing the code, and can send a fresh one", async () => {
    const m = mockFetch(consoleRoutes({ "POST /api/platform/organizations/2/resend-verification": DETAIL }));
    renderWithProviders(<OperatorPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "مراجعة جمعية الأمل" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(await dialog.findByText("البريد غير مؤكد")).toBeInTheDocument();
    expect(dialog.getByText(/لا يُخزَّن رمز التحقق/)).toBeInTheDocument();
    expect(dialog.queryByText(/(?<!\d)\d{6}(?!\d)/)).not.toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "إرسال رمز تحقق جديد" }));
    await waitFor(() => expect(m.calls.some((c) => c.method === "POST" && c.path === "/api/platform/organizations/2/resend-verification")).toBe(true));
  });

  it("lists every operator command of the backend CLI, ready to copy", () => {
    mockFetch(consoleRoutes());
    renderWithProviders(<OperatorPage />);
    const list = screen.getByRole("list", { name: "أوامر المشغّل" });
    const commands = [...list.querySelectorAll("code")].map((c) => c.textContent);
    expect(commands).toEqual([
      "npm run cli -- orgs --status pending_approval",
      "npm run cli -- show <رقم المؤسسة>",
      "npm run cli -- approve <رقم المؤسسة>",
      'npm run cli -- reject <رقم المؤسسة> --reason "السبب"',
      'npm run cli -- suspend <رقم المؤسسة> --reason "السبب"',
    ]);
    // code stays left-to-right inside the right-to-left page
    expect([...list.querySelectorAll("code")].every((c) => c.getAttribute("dir") === "ltr")).toBe(true);
  });

  it("offers no way into the dashboard, and logging out clears the session and goes to /login", async () => {
    const m = mockFetch(consoleRoutes({ "POST /api/auth/logout": { ok: true } }));
    renderWithProviders(<OperatorPage />);
    expect(screen.queryByRole("link", { name: /لوحة التحكم/ })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "تسجيل الخروج" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(m.calls.some((c) => c.method === "POST" && c.path === "/api/auth/logout")).toBe(true);
  });
});

describe("dashboard layout safety net (a session that began before the operator page existed)", () => {
  it("sends a platform operator to /operator and renders none of the workspace shell", async () => {
    mockFetch({ "GET /api/auth/session": OPS, "GET /api/notifications": { data: [] } });
    const { container } = renderWithProviders(
      <DashboardLayout>
        <p>محتوى الصفحة</p>
      </DashboardLayout>,
    );
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/operator"));
    // once the session says "operator" nothing of the workspace stays on screen (the shell renders instantly for everyone
    // else, so it is visible until that answer arrives — the cookie repaired by the same request prevents a second visit)
    await waitFor(() => expect(screen.queryByText("محتوى الصفحة")).not.toBeInTheDocument());
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector("header")).toBeNull();
  });

  it("organization users get the normal shell and are not redirected", async () => {
    mockFetch({ "GET /api/auth/session": ORG_ADMIN, "GET /api/notifications": { data: [] } });
    const { container } = renderWithProviders(
      <DashboardLayout>
        <p>محتوى الصفحة</p>
      </DashboardLayout>,
    );
    expect(await screen.findByText("محتوى الصفحة")).toBeInTheDocument();
    expect(container.querySelector("aside")).not.toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
