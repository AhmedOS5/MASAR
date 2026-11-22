// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { json, mockFetch } from "@/test/helpers";
import { renderWithProviders } from "@/test/render";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/onboarding" }));

import OrganizationForm from "@/app/onboarding/_components/OrganizationForm";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  seedRegistration();
  window.scrollTo = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  router.push.mockClear();
});

const el = (container, name) => container.querySelector(`[name="${name}"]`);

// orgName / orgType are locked fields prefilled from the registration step (sessionStorage).
const seedRegistration = () =>
  sessionStorage.setItem(
    "registerFormData",
    JSON.stringify({ organizationName: "مؤسسة الأمل", organizationEmail: "", phone: "", organizationType: "ngo" }),
  );
const SESSION = { "GET /api/auth/session": { user: { name: "أحمد" }, organization: null } };
const posts = (m) => m.calls.filter((c) => c.path === "/api/organization/o");

async function fillRequired(container) {
  const user = userEvent.setup();
  await user.type(el(container, "regNumber"), "PS-12345");
  await user.type(el(container, "phone"), "+970 59 123 4567");
  await user.type(el(container, "email"), "info@amal.org");
  await user.type(el(container, "managerName"), "أحمد");
  return user;
}

const submit = (user) => user.click(screen.getByRole("button", { name: /إرسال للموافقة/ }));

describe("OrganizationForm submit (used to mask EVERY failure as success)", () => {
  it("posts the profile as the backend contract and goes to the waiting screen on success", async () => {
    const m = mockFetch({ ...SESSION, "POST /api/organization/o": { ok: true } });
    const { container } = renderWithProviders(<OrganizationForm />);
    const user = await fillRequired(container);
    await submit(user);

    await waitFor(() => expect(posts(m)).toHaveLength(1));
    expect(posts(m)[0].body).toMatchObject({
      organization_name: "مؤسسة الأمل",
      organization_type: "NGO",
      registration_number: "PS-12345",
      country: "PS",
      phone: "+970 59 123 4567",
      email: "info@amal.org",
      contact_person_name: "أحمد",
      sectors: [],
    });
    expect(await screen.findByText(/تم إرسال بيانات المنظمة بنجاح/)).toBeInTheDocument();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/onboarding/waiting-approval"), { timeout: 3000 });
  });

  it("a SERVER ERROR (500) is reported as an error: no success message, no redirect, nothing queued locally", async () => {
    mockFetch({ ...SESSION, "POST /api/organization/o": json({ message: "Server Error" }, { status: 500 }) });
    const { container } = renderWithProviders(<OrganizationForm />);
    const user = await fillRequired(container);
    await submit(user);

    expect(await screen.findByText("Server Error")).toBeInTheDocument();
    expect(screen.queryByText(/تم إرسال بيانات المنظمة بنجاح/)).not.toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 1700)); // longer than the old 1.5s success redirect
    expect(router.push).not.toHaveBeenCalled();
    expect(localStorage.getItem("pending_onboarding_submission")).toBeNull();
    expect(screen.getByRole("button", { name: /إرسال للموافقة/ })).toBeEnabled();
  });

  it("a network failure is reported as an error too", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { container } = renderWithProviders(<OrganizationForm />);
    const user = await fillRequired(container);
    await submit(user);
    expect(await screen.findByText(/تعذر الاتصال بالخادم/)).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("backend validation errors (422) reach the matching inputs", async () => {
    mockFetch({
      ...SESSION,
      "POST /api/organization/o": json(
        { message: "invalid", errors: { registration_number: ["رقم التسجيل مستخدم"], contact_person_name: ["الاسم قصير"] } },
        { status: 422 },
      ),
    });
    const { container } = renderWithProviders(<OrganizationForm />);
    const user = await fillRequired(container);
    await submit(user);

    expect(await screen.findByText("رقم التسجيل مستخدم")).toBeInTheDocument();
    expect(screen.getByText("الاسم قصير")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("does not call the API when required fields are missing", async () => {
    const m = mockFetch({ ...SESSION });
    renderWithProviders(<OrganizationForm />);
    await userEvent.setup().click(screen.getByRole("button", { name: /إرسال للموافقة/ }));
    expect(await screen.findByText(/حقول مطلوبة لم يتم تعبئتها/)).toBeInTheDocument();
    expect(posts(m)).toHaveLength(0);
  });

  it("falls back to the server session for the locked org name/type when this browser has no registration data", async () => {
    sessionStorage.clear();
    mockFetch({
      "GET /api/auth/session": { user: { name: "أحمد" }, organization: { name: "مؤسسة من السيرفر", type: "gov", email: "x@org.org" } },
    });
    const { container } = renderWithProviders(<OrganizationForm />);
    await waitFor(() => expect(el(container, "orgName")).toHaveValue("مؤسسة من السيرفر"));
    expect(el(container, "orgType")).toHaveValue("Gov");
    expect(el(container, "email")).toHaveValue("x@org.org");
  });

  it("prefills from the registration step but never from a stored password", () => {
    sessionStorage.setItem(
      "registerFormData",
      JSON.stringify({ organizationName: "Saved", organizationEmail: "s@org.org", phone: "+970 59 000 0000", organizationType: "ngo" }),
    );
    mockFetch({ ...SESSION });
    const { container } = renderWithProviders(<OrganizationForm />);
    expect(el(container, "orgName")).toHaveValue("Saved");
    expect(el(container, "orgType")).toHaveValue("NGO");
  });
});
