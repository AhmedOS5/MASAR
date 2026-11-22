// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { json, mockFetch } from "@/test/helpers";
import { renderWithProviders } from "@/test/render";

const router = { push: vi.fn(), replace: vi.fn() };
let params = new URLSearchParams("email=admin%40org.org");
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => params }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));
// eslint-disable-next-line @next/next/no-img-element
vi.mock("next/image", () => ({ default: (p) => <img alt={p.alt} src={p.src} /> }));

import ResetPasswordPage from "@/app/reset-password/page";
import { resetPassword } from "@/services/auth.service";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  params = new URLSearchParams("email=admin%40org.org");
  Object.values(router).forEach((f) => f.mockClear());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const PASSWORD = "N3w!Password";
const emailInput = () => screen.getByLabelText("البريد الإلكتروني");
const codeInput = () => screen.getByLabelText(/رمز إعادة التعيين \(6 أرقام\)/);
const passwordInput = () => screen.getByLabelText("كلمة المرور الجديدة");
const confirmInput = () => screen.getByLabelText("تأكيد كلمة المرور");
const submitBtn = () => screen.getByRole("button", { name: /تغيير كلمة المرور/ });
const resendBtn = () => screen.getByRole("button", { name: /إعادة إرسال الرمز/ });

async function fill({ code = "123456", password = PASSWORD, confirmation = password } = {}) {
  const user = userEvent.setup();
  if (code) await user.type(codeInput(), code);
  if (password) await user.type(passwordInput(), password);
  if (confirmation) await user.type(confirmInput(), confirmation);
  return user;
}

describe("reset-password page", () => {
  it("pre-fills the e-mail, has an empty numeric one-time-code field, and needs every field before it enables the button", async () => {
    mockFetch({});
    renderWithProviders(<ResetPasswordPage />);
    expect(emailInput()).toHaveValue("admin@org.org");
    expect(codeInput()).toHaveValue("");
    expect(codeInput()).toHaveAttribute("inputmode", "numeric");
    expect(codeInput()).toHaveAttribute("autocomplete", "one-time-code");
    expect(passwordInput()).toHaveAttribute("autocomplete", "new-password");
    expect(submitBtn()).toBeDisabled();

    const user = userEvent.setup();
    await user.type(codeInput(), "12345");
    await user.type(passwordInput(), PASSWORD);
    await user.type(confirmInput(), PASSWORD);
    expect(submitBtn()).toBeDisabled(); // 5 digits only
    await user.type(codeInput(), "6");
    expect(submitBtn()).toBeEnabled();
  });

  it("after the request screen it says (neutrally) that a code was sent; opened directly it says nothing", () => {
    mockFetch({});
    params = new URLSearchParams("email=admin%40org.org&sent=1&wait=0");
    const { unmount } = renderWithProviders(<ResetPasswordPage />);
    expect(screen.getByRole("status")).toHaveTextContent("إذا كان البريد مرتبطاً بحساب مفعّل فقد أرسلنا إليه رمز إعادة التعيين");
    unmount();

    params = new URLSearchParams("email=admin%40org.org");
    renderWithProviders(<ResetPasswordPage />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("works without ?email= (typed by hand)", async () => {
    params = new URLSearchParams();
    const m = mockFetch({ "POST /api/auth/reset-password": { reset: true } });
    renderWithProviders(<ResetPasswordPage />);
    expect(emailInput()).toHaveValue("");
    const user = await fill();
    expect(submitBtn()).toBeDisabled();
    await user.type(emailInput(), "me@org.org");
    await user.click(submitBtn());
    await waitFor(() => expect(m.calls).toHaveLength(1));
    expect(m.calls[0].body.email).toBe("me@org.org");
  });

  it("keeps only digits in the code: letters dropped, '123 456' and Arabic-Indic digits normalised, length capped", async () => {
    mockFetch({});
    renderWithProviders(<ResetPasswordPage />);
    const user = userEvent.setup();
    await user.type(codeInput(), "12a3 4-5");
    expect(codeInput()).toHaveValue("12345");
    await user.clear(codeInput());
    await user.type(codeInput(), "١٢٣٤٥٦٧");
    expect(codeInput()).toHaveValue("123456");
  });

  it("shows which password rules are met while typing, and can reveal the password", async () => {
    mockFetch({});
    renderWithProviders(<ResetPasswordPage />);
    const rules = screen.getByRole("list", { name: "شروط كلمة المرور" });
    expect(rules).toHaveTextContent("○ 8 أحرف على الأقل");
    const user = userEvent.setup();
    await user.type(passwordInput(), "abcdefgh1!");
    expect(rules).not.toHaveTextContent("○");
    await user.click(screen.getByRole("button", { name: "إظهار كلمة المرور" }));
    expect(passwordInput()).toHaveAttribute("type", "text");
    expect(confirmInput()).toHaveAttribute("type", "text");
  });

  it("validates locally and sends NOTHING for a weak password or a mismatch", async () => {
    const m = mockFetch({});
    renderWithProviders(<ResetPasswordPage />);
    const user = await fill({ password: "weakpass" });
    await user.click(submitBtn());
    expect(await screen.findByText(/لا تستوفي الشروط/)).toBeInTheDocument();

    await user.clear(passwordInput());
    await user.clear(confirmInput());
    await user.type(passwordInput(), PASSWORD);
    await user.type(confirmInput(), "Different1!");
    await user.click(submitBtn());
    expect(await screen.findByText("كلمتا المرور غير متطابقتين.")).toBeInTheDocument();
    expect(m.calls).toHaveLength(0);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("sends { email, code, password, password_confirmation } to POST /api/auth/reset-password and goes to the login page, e-mail pre-filled", async () => {
    const m = mockFetch({ "POST /api/auth/reset-password": { reset: true, message: "تم تغيير كلمة المرور." } });
    renderWithProviders(<ResetPasswordPage />);
    const user = await fill();
    await user.click(submitBtn());

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/login?reset=1&email=admin%40org.org"));
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0].path).toBe("/api/auth/reset-password");
    expect(m.calls[0].method).toBe("POST");
    expect(m.calls[0].body).toEqual({ email: "admin@org.org", code: "123456", password: PASSWORD, password_confirmation: PASSWORD });
    expect(m.calls[0].url.startsWith("/api")).toBe(true);
  });

  it("pressing Enter submits", async () => {
    const m = mockFetch({ "POST /api/auth/reset-password": { reset: true } });
    renderWithProviders(<ResetPasswordPage />);
    const user = await fill();
    await user.type(confirmInput(), "{Enter}");
    await waitFor(() => expect(m.calls).toHaveLength(1));
  });

  it("a wrong or expired code is shown under the code field; the form stays usable and the typed password is kept", async () => {
    mockFetch({
      "POST /api/auth/reset-password": json(
        { message: "الرمز غير صحيح أو منتهي الصلاحية.", errors: { code: ["الرمز غير صحيح أو منتهي الصلاحية."] } },
        { status: 422 },
      ),
    });
    renderWithProviders(<ResetPasswordPage />);
    const user = await fill();
    await user.click(submitBtn());
    expect(await screen.findByText("الرمز غير صحيح أو منتهي الصلاحية.")).toBeInTheDocument();
    expect(codeInput()).toBeEnabled();
    expect(codeInput()).toHaveAttribute("aria-invalid", "true");
    expect(passwordInput()).toHaveValue(PASSWORD);
    expect(router.push).not.toHaveBeenCalled();
    await userEvent.setup().type(codeInput(), "1");
    expect(screen.queryByText("الرمز غير صحيح أو منتهي الصلاحية.")).not.toBeInTheDocument();
  });

  it("a server-side password error lands on the password field", async () => {
    mockFetch({ "POST /api/auth/reset-password": json({ message: "x", errors: { password: ["كلمة المرور ضعيفة."] } }, { status: 422 }) });
    renderWithProviders(<ResetPasswordPage />);
    const user = await fill();
    await user.click(submitBtn());
    expect(await screen.findByText("كلمة المرور ضعيفة.")).toBeInTheDocument();
    expect(passwordInput()).toHaveAttribute("aria-invalid", "true");
  });

  it("after five wrong attempts (429) the code field is locked; requesting a NEW code unlocks it", async () => {
    const m = mockFetch({
      "POST /api/auth/reset-password": json({ message: "تجاوزت عدد المحاولات المسموح بها. اطلب رمزاً جديداً." }, { status: 429 }),
      "POST /api/auth/forgot-password": { message: "إذا كان البريد مسجلاً فسيصلك رمز إعادة تعيين كلمة المرور خلال لحظات.", resend_after_seconds: 0 },
    });
    renderWithProviders(<ResetPasswordPage />);
    const user = await fill();
    await user.click(submitBtn());

    expect(await screen.findByRole("alert")).toHaveTextContent("تجاوزت عدد المحاولات");
    expect(codeInput()).toBeDisabled();
    expect(codeInput()).toHaveValue("");
    expect(submitBtn()).toBeDisabled();
    expect(screen.getByText(/اطلب رمزاً جديداً بالزر أدناه/)).toBeInTheDocument();

    await user.click(resendBtn());
    await waitFor(() => expect(m.calls.some((c) => c.path === "/api/auth/forgot-password")).toBe(true));
    await waitFor(() => expect(codeInput()).toBeEnabled());
    expect(await screen.findByRole("status")).toHaveTextContent("إذا كان البريد مسجلاً");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(m.calls.find((c) => c.path === "/api/auth/forgot-password").body).toEqual({ email: "admin@org.org" });
  });

  it("a network failure shows the error banner and keeps the form usable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    renderWithProviders(<ResetPasswordPage />);
    const user = await fill();
    await user.click(submitBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر الاتصال بالخادم");
    expect(submitBtn()).toBeEnabled();
  });

  describe("requesting another code", () => {
    it("starts with the server's cooldown from the previous screen: disabled with a countdown, enabled when it ends", () => {
      vi.useFakeTimers();
      mockFetch({});
      params = new URLSearchParams("email=admin%40org.org&sent=1&wait=60");
      renderWithProviders(<ResetPasswordPage />);
      expect(resendBtn()).toBeDisabled();
      expect(resendBtn()).toHaveTextContent("01:00");
      act(() => vi.advanceTimersByTime(30_000));
      expect(resendBtn()).toHaveTextContent("00:30");
      act(() => vi.advanceTimersByTime(31_000));
      expect(resendBtn()).toBeEnabled();
      expect(resendBtn()).not.toHaveTextContent(":");
    });

    it("is available at once when there is no cooldown, and an absurd ?wait= is capped", () => {
      mockFetch({});
      params = new URLSearchParams("email=admin%40org.org&sent=1&wait=0");
      const { unmount } = renderWithProviders(<ResetPasswordPage />);
      expect(resendBtn()).toBeEnabled();
      unmount();

      params = new URLSearchParams("email=admin%40org.org&sent=1&wait=99999999");
      renderWithProviders(<ResetPasswordPage />);
      expect(resendBtn()).toHaveTextContent("60:00"); // one hour at most
      unmount?.();
    });

    it("a cooldown refusal (429) starts the visible countdown from the server's number", async () => {
      mockFetch({ "POST /api/auth/forgot-password": json({ message: "يرجى الانتظار 42 ثانية قبل طلب رمز جديد." }, { status: 429 }) });
      renderWithProviders(<ResetPasswordPage />);
      await userEvent.setup().click(resendBtn());
      expect(await screen.findByRole("alert")).toHaveTextContent("يرجى الانتظار 42 ثانية");
      await waitFor(() => expect(resendBtn()).toHaveTextContent("00:42"));
      expect(resendBtn()).toBeDisabled();
    });

    it("clears the typed code (it belongs to the previous one) and needs an e-mail", async () => {
      mockFetch({ "POST /api/auth/forgot-password": { message: "ok", resend_after_seconds: 0 } });
      renderWithProviders(<ResetPasswordPage />);
      const user = userEvent.setup();
      await user.type(codeInput(), "123");
      await user.click(resendBtn());
      await waitFor(() => expect(codeInput()).toHaveValue(""));
      await user.clear(emailInput());
      expect(resendBtn()).toBeDisabled();
    });
  });

  it("SECURITY: neither the code nor the password is written to browser storage or put in the URL, and only the expected endpoint is called", async () => {
    const m = mockFetch({ "POST /api/auth/reset-password": { reset: true } });
    renderWithProviders(<ResetPasswordPage />);
    const user = await fill();
    await user.click(submitBtn());
    await waitFor(() => expect(router.push).toHaveBeenCalled());

    const everything = JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage });
    expect(everything).not.toContain(PASSWORD);
    expect(everything).not.toContain("123456");
    const target = router.push.mock.calls[0][0];
    expect(target).not.toContain("123456");
    expect(target).not.toContain(encodeURIComponent(PASSWORD));
    expect(m.calls.map((c) => c.path)).toEqual(["/api/auth/reset-password"]);
  });
});

describe("resetPassword service", () => {
  it("maps the camelCase argument to the API's snake_case body", async () => {
    const m = mockFetch({ "POST /api/auth/reset-password": { reset: true } });
    await resetPassword({ email: "a@b.org", code: "000001", password: PASSWORD, passwordConfirmation: PASSWORD });
    expect(m.calls[0].body).toEqual({ email: "a@b.org", code: "000001", password: PASSWORD, password_confirmation: PASSWORD });
  });
});
