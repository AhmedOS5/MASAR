// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { json, mockFetch } from "@/test/helpers";
import { renderWithProviders } from "@/test/render";

const router = { push: vi.fn(), replace: vi.fn() };
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => params }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));
// eslint-disable-next-line @next/next/no-img-element
vi.mock("next/image", () => ({ default: (p) => <img alt={p.alt} src={p.src} /> }));

import ForgotPasswordPage from "@/app/forgot-password/page";
import { forgotPassword } from "@/services/auth.service";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  params = new URLSearchParams();
  Object.values(router).forEach((f) => f.mockClear());
});
afterEach(() => vi.unstubAllGlobals());

const emailInput = () => screen.getByLabelText("البريد الإلكتروني");
const submitBtn = () => screen.getByRole("button", { name: /إرسال رمز إعادة التعيين/ });
const ANSWER = { message: "إذا كان البريد مسجلاً فسيصلك رمز إعادة تعيين كلمة المرور خلال لحظات.", expires_in_minutes: 15, resend_after_seconds: 60 };

describe("forgot-password page", () => {
  it("starts empty (or pre-filled from the login page), and cannot be sent without an e-mail", async () => {
    mockFetch({});
    const { unmount } = renderWithProviders(<ForgotPasswordPage />);
    expect(emailInput()).toHaveValue("");
    expect(submitBtn()).toBeDisabled();
    unmount();

    params = new URLSearchParams("email=jalal%40org.org");
    renderWithProviders(<ForgotPasswordPage />);
    expect(emailInput()).toHaveValue("jalal@org.org");
    expect(submitBtn()).toBeEnabled();
  });

  it("rejects a malformed address locally and sends nothing", async () => {
    const m = mockFetch({});
    renderWithProviders(<ForgotPasswordPage />);
    const user = userEvent.setup();
    await user.type(emailInput(), "not-an-email");
    await user.click(submitBtn());
    expect(await screen.findByText("أدخل بريداً إلكترونياً صالحاً.")).toBeInTheDocument();
    expect(m.calls).toHaveLength(0);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("sends { email } to POST /api/auth/forgot-password, then goes to the reset screen with the server's cooldown", async () => {
    const m = mockFetch({ "POST /api/auth/forgot-password": ANSWER });
    renderWithProviders(<ForgotPasswordPage />);
    const user = userEvent.setup();
    await user.type(emailInput(), "  admin@org.org ");
    await user.click(submitBtn());

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/reset-password?email=admin%40org.org&sent=1&wait=60"));
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0].path).toBe("/api/auth/forgot-password");
    expect(m.calls[0].method).toBe("POST");
    expect(m.calls[0].body).toEqual({ email: "admin@org.org" });
    expect(m.calls[0].url.startsWith("/api")).toBe(true); // same-origin BFF only
  });

  it("pressing Enter submits", async () => {
    const m = mockFetch({ "POST /api/auth/forgot-password": ANSWER });
    renderWithProviders(<ForgotPasswordPage />);
    await userEvent.setup().type(emailInput(), "admin@org.org{Enter}");
    await waitFor(() => expect(m.calls).toHaveLength(1));
  });

  it("goes to the SAME place for every address — the screen never reveals whether the account exists", async () => {
    // the backend answers identically for unknown and known addresses; the UI must not add a difference of its own
    mockFetch({ "POST /api/auth/forgot-password": ANSWER });
    renderWithProviders(<ForgotPasswordPage />);
    const user = userEvent.setup();
    await user.type(emailInput(), "ghost@nowhere.org");
    await user.click(submitBtn());
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/reset-password?email=ghost%40nowhere.org&sent=1&wait=60"));
    expect(screen.queryByText(/غير مسجل|غير موجود|لا يوجد حساب/)).not.toBeInTheDocument();
  });

  it("a cooldown / quota refusal (429) is shown and keeps the user here", async () => {
    mockFetch({ "POST /api/auth/forgot-password": json({ message: "يرجى الانتظار 42 ثانية قبل طلب رمز جديد." }, { status: 429 }) });
    renderWithProviders(<ForgotPasswordPage />);
    const user = userEvent.setup();
    await user.type(emailInput(), "admin@org.org");
    await user.click(submitBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent("يرجى الانتظار 42 ثانية");
    expect(router.push).not.toHaveBeenCalled();
    expect(submitBtn()).toBeEnabled();
  });

  it("a server field error lands under the e-mail field", async () => {
    mockFetch({ "POST /api/auth/forgot-password": json({ message: "x", errors: { email: ["بريد إلكتروني غير صالح."] } }, { status: 422 }) });
    renderWithProviders(<ForgotPasswordPage />);
    const user = userEvent.setup();
    await user.type(emailInput(), "a@b.co");
    await user.click(submitBtn());
    expect(await screen.findByText("بريد إلكتروني غير صالح.")).toBeInTheDocument();
    expect(emailInput()).toHaveAttribute("aria-invalid", "true");
  });

  it("a network failure shows the error banner and keeps the form usable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    renderWithProviders(<ForgotPasswordPage />);
    const user = userEvent.setup();
    await user.type(emailInput(), "admin@org.org");
    await user.click(submitBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر الاتصال بالخادم");
    expect(submitBtn()).toBeEnabled();
  });

  it("links to the reset screen ('I already have a code', e-mail carried over) and back to login", async () => {
    mockFetch({});
    renderWithProviders(<ForgotPasswordPage />);
    expect(screen.getByRole("link", { name: "أدخل الرمز" })).toHaveAttribute("href", "/reset-password");
    await userEvent.setup().type(emailInput(), "a@b.co");
    expect(screen.getByRole("link", { name: "أدخل الرمز" })).toHaveAttribute("href", "/reset-password?email=a%40b.co");
    expect(screen.getByRole("link", { name: "سجّل الدخول" })).toHaveAttribute("href", "/login");
  });

  it("nothing is written to browser storage", async () => {
    mockFetch({ "POST /api/auth/forgot-password": ANSWER });
    renderWithProviders(<ForgotPasswordPage />);
    const user = userEvent.setup();
    await user.type(emailInput(), "admin@org.org");
    await user.click(submitBtn());
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage })).not.toContain("admin@org.org");
  });
});

describe("forgotPassword service", () => {
  it("POSTs { email } without the auth redirect behaviour", async () => {
    const m = mockFetch({ "POST /api/auth/forgot-password": ANSWER });
    expect(await forgotPassword("a@b.org")).toEqual(ANSWER);
    expect(m.calls[0].body).toEqual({ email: "a@b.org" });
  });
});
