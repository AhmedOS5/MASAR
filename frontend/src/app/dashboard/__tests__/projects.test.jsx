// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { json, mockFetch } from "@/test/helpers";
import { renderWithProviders } from "@/test/render";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/dashboard/projects",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "7" }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));

import ProjectsPage from "@/app/dashboard/projects/page";
import ProjectPage from "@/app/dashboard/projects/[id]/page";

afterEach(() => vi.unstubAllGlobals());

const ADMIN = { user: { name: "ليلى", is_system_admin: true, permissions: [] }, organization: { name: "منظمة" }, onboarding_status: "approved" };
const sessionOf = (permissions) => ({ user: { name: "سارة", is_system_admin: false, permissions }, organization: { name: "منظمة" }, onboarding_status: "approved" });

const PROJECT = {
  id: 7, code: "PRJ-001", name: "مشروع المياه", description: "توصيل المياه", status: "active", start_date: "2026-01-01", end_date: null,
  my_role: "member", members_count: 2, requests_count: 1, tasks_count: 0, beneficiaries_count: 1,
  members: [
    { user_id: 3, name: "سارة", email: "s@org.org", role_title: "مسؤول متابعة وتقييم", project_role: "member" },
    { user_id: 4, name: "المشرف", email: "l@org.org", role_title: "مدير", project_role: "supervisor" },
  ],
};
const BENEFICIARY = { id: 11, code: "BEN-0001", project_id: 7, full_name: "أمل خليل", national_id: "400111222", gender: "female", phone: "0599000111", region: "غزة", status: "active" };
const OPTIONS = { data: { regions: ["غزة"], projects: [], employees: [], request_types: ["مشتريات"], departments: [] } };

describe("projects list", () => {
  it("shows the person's projects with their role and counters; a non-manager gets no create button", async () => {
    mockFetch({
      "GET /api/auth/session": sessionOf(["projects.view"]),
      "GET /api/projects": { data: [{ ...PROJECT, my_role: "supervisor" }], meta: { total: 1 } },
    });
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText("مشروع المياه")).toBeInTheDocument();
    expect(screen.getByText("PRJ-001")).toBeInTheDocument();
    expect(screen.getByText(/دورك: مشرف/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /مشروع المياه/ })).toHaveAttribute("href", "/dashboard/projects/7");
    await waitFor(() => expect(screen.queryByRole("button", { name: /مشروع جديد/ })).not.toBeInTheDocument());
  });

  it("the system admin creates a project: validation first, then POST /projects", async () => {
    const m = mockFetch({
      "GET /api/auth/session": ADMIN,
      "GET /api/projects": { data: [], meta: { total: 0 } },
      "POST /api/projects": json({ data: { ...PROJECT, members: [] } }, { status: 201 }),
    });
    renderWithProviders(<ProjectsPage />);
    const user = userEvent.setup();
    expect(await screen.findByText(/أنشئ مشروعاً وعيّن له الفريق/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /مشروع جديد/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "إنشاء المشروع" }));
    expect(await within(dialog).findByText("اسم المشروع مطلوب")).toBeInTheDocument();
    expect(m.calls.some((c) => c.method === "POST")).toBe(false);

    await user.type(within(dialog).getByLabelText(/اسم المشروع/), "مشروع المياه");
    await user.click(within(dialog).getByRole("button", { name: "إنشاء المشروع" }));
    await waitFor(() => expect(m.calls.find((c) => c.method === "POST" && c.path === "/api/projects")?.body).toMatchObject({ name: "مشروع المياه", status: "active" }));
  });

  it("an empty list tells a team member to wait for the admin", async () => {
    mockFetch({ "GET /api/auth/session": sessionOf(["projects.view"]), "GET /api/projects": { data: [], meta: { total: 0 } } });
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText(/سيضيفك مدير النظام إلى مشروع/)).toBeInTheDocument();
  });
});

describe("one project", () => {
  const routes = (session, extra = {}) => ({
    "GET /api/auth/session": session,
    "GET /api/projects/7": { data: PROJECT },
    "GET /api/options": OPTIONS,
    ...extra,
  });

  it("a field officer sees the team and the tabs their package allows — and no admin buttons", async () => {
    mockFetch(routes(sessionOf(["projects.view", "requests.view", "tasks.view", "beneficiaries.view", "files.view"])));
    renderWithProviders(<ProjectPage />);
    expect(await screen.findByRole("heading", { name: "مشروع المياه" })).toBeInTheDocument();
    expect(screen.getByText("المشرف")).toBeInTheDocument();
    for (const t of ["الفريق", "الطلبات والمهام", "المستفيدون", "الملفات والتقارير"]) expect(screen.getByRole("tab", { name: t })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: /تعديل الفريق/ })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /تعديل المشروع/ })).not.toBeInTheDocument();
  });

  it("a finance-like package has no beneficiaries tab", async () => {
    mockFetch(routes(sessionOf(["projects.view", "requests.view", "reports.view"])));
    renderWithProviders(<ProjectPage />);
    await screen.findByRole("heading", { name: "مشروع المياه" });
    await waitFor(() => expect(screen.queryByRole("tab", { name: "المستفيدون" })).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "الطلبات والمهام" })).toBeInTheDocument();
  });

  it("the admin rebuilds the team: PUT /projects/7/members with the chosen roles", async () => {
    const m = mockFetch(
      routes(ADMIN, {
        "GET /api/employees": { data: [
          { id: 3, name: "سارة", status: "active", role: { id: 1, title: "مسؤول متابعة وتقييم" } },
          { id: 4, name: "المشرف", status: "active", role: { id: 2, title: "مدير" } },
          { id: 5, name: "جلال", status: "active", role: null },
        ] },
        "PUT /api/projects/7/members": { data: PROJECT },
      }),
    );
    renderWithProviders(<ProjectPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /تعديل الفريق/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("checkbox", { name: /جلال/ })); // add جلال
    await user.selectOptions(within(dialog).getByLabelText("دور جلال في المشروع"), "supervisor");
    await user.click(within(dialog).getByRole("checkbox", { name: /سارة/ })); // remove سارة
    await user.click(within(dialog).getByRole("button", { name: "حفظ الفريق" }));
    await waitFor(() => {
      const put = m.calls.find((c) => c.method === "PUT" && c.path === "/api/projects/7/members");
      expect(put.body.members).toEqual(expect.arrayContaining([{ user_id: 4, project_role: "supervisor" }, { user_id: 5, project_role: "supervisor" }]));
      expect(put.body.members).toHaveLength(2);
    });
  });

  it("beneficiaries: listed in a table; a team member with beneficiaries.edit registers one (POST) with the project in the URL", async () => {
    const m = mockFetch(
      routes(sessionOf(["projects.view", "beneficiaries.view", "beneficiaries.edit"]), {
        "GET /api/projects/7/beneficiaries": { data: [BENEFICIARY], meta: { total: 1 } },
        "POST /api/projects/7/beneficiaries": json({ data: { ...BENEFICIARY, id: 12, attachments: [] } }, { status: 201 }),
      }),
    );
    renderWithProviders(<ProjectPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "المستفيدون" }));
    expect(await screen.findByText("BEN-0001")).toBeInTheDocument();
    expect(screen.getByText("400111222")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /تسجيل مستفيد/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "تسجيل المستفيد" }));
    expect(await within(dialog).findByText("اسم المستفيد مطلوب")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/الاسم الكامل/), "سعيد");
    await user.click(within(dialog).getByRole("button", { name: "تسجيل المستفيد" }));
    await waitFor(() => expect(m.calls.find((c) => c.method === "POST" && c.path === "/api/projects/7/beneficiaries")?.body).toMatchObject({ full_name: "سعيد", status: "active" }));
  });

  it("view-only beneficiaries: no register button, and a beneficiary's file opens read-only", async () => {
    mockFetch(
      routes(sessionOf(["projects.view", "beneficiaries.view"]), {
        "GET /api/projects/7/beneficiaries": { data: [BENEFICIARY], meta: { total: 1 } },
        "GET /api/beneficiaries/11": { data: { ...BENEFICIARY, attachments: [{ id: 1, name: "id.png", size: 2048, mime: "image/png" }] } },
      }),
    );
    renderWithProviders(<ProjectPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "المستفيدون" }));
    await screen.findByText("BEN-0001");
    expect(screen.queryByRole("button", { name: /تسجيل مستفيد/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "فتح ملف أمل خليل" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("link", { name: "id.png" })).toHaveAttribute("href", "/api/beneficiaries/11/attachments/1/download");
    expect(within(dialog).queryByRole("button", { name: /رفع وثيقة/ })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/الاسم الكامل/)).toBeDisabled();
  });

  it("work tab: a request made from here is created inside the project", async () => {
    const m = mockFetch(
      routes(sessionOf(["projects.view", "requests.view", "requests.create"]), {
        "GET /api/requests": { data: [{ id: 1, code: "REQ-001", title: "شراء مضخة", status: "pending", requester: { name: "سارة" } }], meta: { total: 1 } },
        "POST /api/requests": json({ data: { id: 2 } }, { status: 201 }),
        "GET /api/tasks": { data: [], meta: { total: 0 } },
      }),
    );
    renderWithProviders(<ProjectPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "الطلبات والمهام" }));
    expect(await screen.findByText("شراء مضخة")).toBeInTheDocument();
    expect(m.calls.find((c) => c.method === "GET" && c.path === "/api/requests").url).toMatch(/project_id=7/);
    await user.click(screen.getByRole("button", { name: /طلب جديد في المشروع/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/عنوان الطلب/), "مولد كهرباء");
    await user.selectOptions(within(dialog).getByLabelText(/نوع الطلب/), "مشتريات");
    await user.click(within(dialog).getByRole("button", { name: "إنشاء الطلب" }));
    await waitFor(() => expect(m.calls.find((c) => c.method === "POST" && c.path === "/api/requests")?.body).toMatchObject({ title: "مولد كهرباء", project_id: 7 }));
  });
});
