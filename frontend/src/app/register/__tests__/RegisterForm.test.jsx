// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { json, mockFetch } from "@/test/helpers";
import { renderWithProviders } from "@/test/render";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/register" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));

import RegisterForm from "@/app/register/RegisterForm";

beforeEach(() => {
  sessionStorage.clear();
  window.scrollTo = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  router.push.mockClear();
});

// RegisterForm labels are not <label for>, so locate inputs by name.
const input = (container, name) => container.querySelector(`[name="${name}"]`);

async function fillValid(container, overrides = {}) {
  const user = userEvent.setup();
  const { agreedToTerms = true, ...fields } = overrides;
  const v = {
    organizationName: "مؤسسة الأمل",
    organizationEmail: "contact@amal.org",
    phone: "+970 59 123 4567",
    password: "Str0ng!Pass",
    confirmPassword: "Str0ng!Pass",
    personalEmail: "admin@amal.org",
    ...fields,
  };
  for (const [name, value] of Object.entries(v)) {
    const el = input(container, name);
    await user.clear(el);
    if (value) await user.type(el, value);
  }
  await user.selectOptions(input(container, "region"), "gaza");
  if (agreedToTerms) await user.click(screen.getByRole("checkbox"));
  return user;
}

describe("RegisterForm → organization registration", () => {
  it("transmits the exact payload the Laravel API expects", async () => {
    const m = mockFetch({ "POST /api/auth/register": { message: "ok" } });
    const { container } = renderWithProviders(<RegisterForm />);
    const user = await fillValid(container);
    await user.click(screen.getByRole("button", { name: /إنشاء مساحة العمل/ }));

    await waitFor(() => expect(m.calls).toHaveLength(1));
    expect(m.calls[0].path).toBe("/api/auth/register");
    expect(m.calls[0].method).toBe("POST");
    expect(m.calls[0].body).toEqual({
      organization_name: "مؤسسة الأمل",
      organization_email: "contact@amal.org",
      admin_email: "admin@amal.org",
      organization_region: "gaza",
      organization_phone: "+970 59 123 4567",
      admin_password: "Str0ng!Pass",
      admin_password_confirmation: "Str0ng!Pass",
      organization_type: "ngo",
      agreed_to_terms: true,
    });
  });

  it("moves on to e-mail verification after success", async () => {
    mockFetch({ "POST /api/auth/register": { message: "ok" } });
    const { container } = renderWithProviders(<RegisterForm />);
    const user = await fillValid(container);
    await user.click(screen.getByRole("button", { name: /إنشاء مساحة العمل/ }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/verify-email?email=${encodeURIComponent("admin@amal.org")}`),
    );
    // nothing about verification is stored in the browser: the 6-digit code is typed on the next screen
    expect(sessionStorage.getItem("verificationUrl")).toBeNull();
  });

  it("NEVER persists the password (or its confirmation) to sessionStorage", async () => {
    mockFetch({ "POST /api/auth/register": {} });
    const { container } = renderWithProviders(<RegisterForm />);
    const user = await fillValid(container);
    await user.click(screen.getByRole("button", { name: /إنشاء مساحة العمل/ }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());

    const everything = JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage });
    expect(everything).not.toContain("Str0ng!Pass");
    const saved = JSON.parse(sessionStorage.getItem("registerFormData"));
    expect(saved).not.toHaveProperty("password");
    expect(saved).not.toHaveProperty("confirmPassword");
    expect(saved.organizationName).toBe("مؤسسة الأمل"); // non-secret fields are kept for onboarding prefill
  });

  it("restores the draft without restoring any password", () => {
    sessionStorage.setItem(
      "registerFormData",
      JSON.stringify({ organizationName: "Saved Org", password: "leaked", confirmPassword: "leaked" }),
    );
    const { container } = renderWithProviders(<RegisterForm />);
    expect(input(container, "organizationName")).toHaveValue("Saved Org");
    expect(input(container, "password")).toHaveValue("");
    expect(input(container, "confirmPassword")).toHaveValue("");
  });

  it("hydrates without a mismatch when a saved draft exists (first render never reads sessionStorage)", async () => {
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const { act } = await import("@testing-library/react");

    // server / build time: no browser storage, empty form
    const html = renderToString(<RegisterForm />);
    expect(html).not.toContain("Saved Org");

    // browser: the visitor already typed something earlier in this tab
    sessionStorage.setItem("registerFormData", JSON.stringify({ organizationName: "Saved Org", personalEmail: "me@amal.org" }));
    sessionStorage.setItem("registrationCompleted", "true");
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const recoverable = [];
    let root;
    await act(async () => {
      root = hydrateRoot(container, <RegisterForm />, { onRecoverableError: (e) => recoverable.push(e) });
    });

    expect(recoverable).toEqual([]); // used to be React error #418
    expect(input(container, "organizationName")).toHaveValue("Saved Org"); // ...and the draft is still restored
    expect(container.querySelector('a[href^="/verify-email"]')).not.toBeNull(); // "back to verification" link
    act(() => root.unmount());
    container.remove();
  });

  it("validates locally and sends NOTHING when the form is invalid", async () => {
    const m = mockFetch({});
    const { container } = renderWithProviders(<RegisterForm />);
    const user = await fillValid(container, {
      organizationEmail: "me@gmail.com", // free provider => rejected
      confirmPassword: "different",
      agreedToTerms: false,
    });
    await user.click(screen.getByRole("button", { name: /إنشاء مساحة العمل/ }));

    expect(await screen.findByText(/غير مسموح ببريد مجاني/)).toBeInTheDocument();
    expect(screen.getByText("كلمات المرور غير متطابقة")).toBeInTheDocument();
    expect(screen.getByText(/الموافقة على الشروط/)).toBeInTheDocument();
    expect(m.calls).toHaveLength(0);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("attaches backend validation errors to the right inputs, incl. region & phone (previously mismatched keys)", async () => {
    mockFetch({
      "POST /api/auth/register": json(
        {
          message: "The given data was invalid.",
          errors: {
            organization_email: ["هذا البريد مستخدم مسبقاً"],
            organization_region: ["المنطقة غير صالحة"],
            organization_phone: ["رقم الجوال غير صالح"],
            admin_password: ["كلمة المرور ضعيفة"],
          },
        },
        { status: 422 },
      ),
    });
    const { container } = renderWithProviders(<RegisterForm />);
    const user = await fillValid(container);
    await user.click(screen.getByRole("button", { name: /إنشاء مساحة العمل/ }));

    expect(await screen.findByText("هذا البريد مستخدم مسبقاً")).toBeInTheDocument();
    expect(screen.getByText("المنطقة غير صالحة")).toBeInTheDocument();
    expect(screen.getByText("رقم الجوال غير صالح")).toBeInTheDocument();
    expect(screen.getByText("كلمة المرور ضعيفة")).toBeInTheDocument();
    // error banner + toast (UI states for API errors)
    expect(screen.getByText(/يوجد 4 أخطاء/)).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows a toast and a banner for a server crash (500) and keeps the form usable", async () => {
    mockFetch({ "POST /api/auth/register": json({ message: "Server Error" }, { status: 500 }) });
    const { container } = renderWithProviders(<RegisterForm />);
    const user = await fillValid(container);
    await user.click(screen.getByRole("button", { name: /إنشاء مساحة العمل/ }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((a) => within(a).queryByText(/تعذر إنشاء مساحة العمل/))).toBe(true);
    expect(screen.getByText("Server Error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /إنشاء مساحة العمل/ })).toBeEnabled();
  });
});
