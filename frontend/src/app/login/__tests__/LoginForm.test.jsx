// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { json, mockFetch } from "@/test/helpers";
import { renderWithProviders } from "@/test/render";

const router = { push: vi.fn(), replace: vi.fn() };
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => search,
  usePathname: () => "/login",
}));

vi.mock("next/link", () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));

import LoginForm from "@/app/login/_components/LoginForm";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  router.push.mockClear();
  router.replace.mockClear();
  search = new URLSearchParams();
});

const fill = async (email, password) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("البريد الإلكتروني"), email);
  await user.type(screen.getByLabelText("كلمة المرور"), password);
  await user.click(screen.getByRole("button", { name: /دخول الآن/ }));
  return user;
};

describe("LoginForm (was a setTimeout mock)", () => {
  it("no longer ships pre-filled credentials", () => {
    renderWithProviders(<LoginForm />);
    expect(screen.getByLabelText("البريد الإلكتروني")).toHaveValue("");
    expect(screen.getByLabelText("كلمة المرور")).toHaveValue("");
  });

  it("after activating an invited account (/login?activated=1&email=…) it confirms it and pre-fills only the e-mail", () => {
    search = new URLSearchParams("activated=1&email=jalal%40org.org");
    renderWithProviders(<LoginForm />);
    expect(screen.getByRole("status")).toHaveTextContent("تم تفعيل حسابك");
    expect(screen.getByLabelText("البريد الإلكتروني")).toHaveValue("jalal@org.org");
    expect(screen.getByLabelText("كلمة المرور")).toHaveValue("");
  });

  it("an e-mail in the URL is ignored unless the account was just activated (no pre-fill from arbitrary links)", () => {
    search = new URLSearchParams("email=someone%40else.org");
    renderWithProviders(<LoginForm />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText("البريد الإلكتروني")).toHaveValue("");
  });

  it("after a password reset (/login?reset=1&email=…) it confirms it, pre-fills only the e-mail and says sessions were ended", () => {
    search = new URLSearchParams("reset=1&email=jalal%40org.org");
    renderWithProviders(<LoginForm />);
    expect(screen.getByRole("status")).toHaveTextContent("تم تغيير كلمة المرور وإنهاء جميع الجلسات السابقة");
    expect(screen.getByLabelText("البريد الإلكتروني")).toHaveValue("jalal@org.org");
    expect(screen.getByLabelText("كلمة المرور")).toHaveValue("");
  });

  it("'forgot password' leads to the recovery page (carrying the typed e-mail) instead of 'contact your admin'", async () => {
    renderWithProviders(<LoginForm />);
    const link = screen.getByRole("link", { name: "نسيت كلمة المرور؟" });
    expect(link).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByText(/تواصل مع مدير المنظمة لإعادة/)).not.toBeInTheDocument();
    await userEvent.setup().type(screen.getByLabelText("البريد الإلكتروني"), "me@org.org");
    expect(screen.getByRole("link", { name: "نسيت كلمة المرور؟" })).toHaveAttribute("href", "/forgot-password?email=me%40org.org");
  });

  it("offers invited employees the way to /set-password", () => {
    renderWithProviders(<LoginForm />);
    expect(screen.getByRole("link", { name: "فعّل حسابك" })).toHaveAttribute("href", "/set-password");
  });

  it("calls the login API with the typed credentials and 'remember me'", async () => {
    const m = mockFetch({ "POST /api/auth/login": { redirect: "/dashboard", onboarding_status: "approved" } });
    renderWithProviders(<LoginForm />);
    await fill("admin@org.org", "S3cret!pw");

    await waitFor(() => expect(m.calls).toHaveLength(1));
    expect(m.calls[0].path).toBe("/api/auth/login");
    expect(m.calls[0].body).toEqual({ email: "admin@org.org", password: "S3cret!pw", remember: true });
    // the token is never handled by client code
    expect(JSON.stringify(m.calls[0])).not.toMatch(/localStorage|token/i);
  });

  it("navigates to the dashboard only AFTER the API confirms the login", async () => {
    mockFetch({ "POST /api/auth/login": { redirect: "/dashboard", onboarding_status: "approved" } });
    renderWithProviders(<LoginForm />);
    expect(router.replace).not.toHaveBeenCalled();
    await fill("admin@org.org", "pw");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"), { timeout: 3000 });
  });

  it("honours a safe ?next= and ignores an external one (open-redirect)", async () => {
    mockFetch({ "POST /api/auth/login": { redirect: "/dashboard", onboarding_status: "approved" } });
    search = new URLSearchParams("next=/dashboard/tasks");
    const { unmount } = renderWithProviders(<LoginForm />);
    await fill("a@b.co", "pw");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard/tasks"), { timeout: 3000 });
    unmount();

    router.replace.mockClear();
    mockFetch({ "POST /api/auth/login": { redirect: "/dashboard", onboarding_status: "approved" } });
    search = new URLSearchParams("next=https://evil.example");
    renderWithProviders(<LoginForm />);
    await fill("a@b.co", "pw");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"), { timeout: 3000 });
  });

  it("sends users who still need onboarding to /onboarding regardless of ?next=", async () => {
    mockFetch({ "POST /api/auth/login": { redirect: "/onboarding", onboarding_status: "pending_onboarding" } });
    search = new URLSearchParams("next=/dashboard");
    renderWithProviders(<LoginForm />);
    await fill("a@b.co", "pw");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/onboarding"), { timeout: 3000 });
  });

  it("shows the server's message in an error banner on wrong credentials and does NOT navigate", async () => {
    mockFetch({ "POST /api/auth/login": json({ message: "بيانات الدخول غير صحيحة" }, { status: 401 }) });
    renderWithProviders(<LoginForm />);
    await fill("admin@org.org", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent("بيانات الدخول غير صحيحة");
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /دخول الآن/ })).toBeEnabled();
  });

  it("unverified e-mail (403): shows the message plus a link to the 6-digit code screen that can request a new code", async () => {
    mockFetch({ "POST /api/auth/login": json({ message: "يرجى تفعيل البريد الإلكتروني أولاً." }, { status: 403 }) });
    renderWithProviders(<LoginForm />);
    await fill("owner@org.org", "pw");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("يرجى تفعيل البريد الإلكتروني أولاً.");
    const link = screen.getByRole("link", { name: /إدخال رمز التحقق/ });
    expect(link).toHaveAttribute("href", "/verify-email?email=owner%40org.org&resend=1");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("other 403 errors (e.g. a suspended organization) do not offer the verification link", async () => {
    mockFetch({ "POST /api/auth/login": json({ message: "حساب المنظمة معلّق أو مرفوض، تواصل مع الدعم." }, { status: 403 }) });
    renderWithProviders(<LoginForm />);
    await fill("owner@org.org", "pw");
    await screen.findByRole("alert");
    expect(screen.queryByRole("link", { name: /إدخال رمز التحقق/ })).toBeNull();
  });

  it("shows a friendly error when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    renderWithProviders(<LoginForm />);
    await fill("admin@org.org", "pw");
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر الاتصال بالخادم");
  });

  it("disables the form while the request is in flight", async () => {
    let release;
    mockFetch({
      "POST /api/auth/login": () => new Promise((r) => (release = () => r(json({ redirect: "/dashboard" })))),
    });
    renderWithProviders(<LoginForm />);
    await fill("a@b.co", "pw");
    await waitFor(() => expect(screen.getByLabelText("البريد الإلكتروني")).toBeDisabled());
    release();
  });
});
