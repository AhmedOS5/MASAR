// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { json, mockFetch } from "@/test/helpers";
import { renderWithProviders } from "@/test/render";

const router = { push: vi.fn(), replace: vi.fn() };
let params = new URLSearchParams("email=jalal%40org.org");
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => params }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));
// eslint-disable-next-line @next/next/no-img-element
vi.mock("next/image", () => ({ default: (p) => <img alt={p.alt} src={p.src} /> }));

import SetPasswordPage from "@/app/set-password/page";
import { setPassword } from "@/services/auth.service";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  params = new URLSearchParams("email=jalal%40org.org");
  Object.values(router).forEach((f) => f.mockClear());
});
afterEach(() => vi.unstubAllGlobals());

const PASSWORD = "N3w!Password";
const emailInput = () => screen.getByLabelText("البريد الإلكتروني");
const codeInput = () => screen.getByLabelText(/رمز الدعوة \(6 أرقام\)/);
const passwordInput = () => screen.getByLabelText("كلمة المرور الجديدة");
const confirmInput = () => screen.getByLabelText("تأكيد كلمة المرور");
const submitBtn = () => screen.getByRole("button", { name: /تفعيل الحساب/ });

async function fill({ code = "123456", password = PASSWORD, confirmation = password } = {}) {
  const user = userEvent.setup();
  if (code) await user.type(codeInput(), code);
  if (password) await user.type(passwordInput(), password);
  if (confirmation) await user.type(confirmInput(), confirmation);
  return user;
}

describe("set-password page (employee invitation)", () => {
  it("pre-fills the e-mail from the invitation link, has an empty numeric one-time-code field, and needs every field before it enables the button", async () => {
    mockFetch({});
    renderWithProviders(<SetPasswordPage />);
    expect(emailInput()).toHaveValue("jalal@org.org");
    expect(codeInput()).toHaveValue("");
    expect(codeInput()).toHaveAttribute("inputmode", "numeric");
    expect(codeInput()).toHaveAttribute("autocomplete", "one-time-code");
    expect(passwordInput()).toHaveAttribute("autocomplete", "new-password");
    expect(passwordInput()).toHaveAttribute("type", "password");
    expect(submitBtn()).toBeDisabled();

    const user = userEvent.setup();
    await user.type(codeInput(), "12345");
    await user.type(passwordInput(), PASSWORD);
    await user.type(confirmInput(), PASSWORD);
    expect(submitBtn()).toBeDisabled(); // 5 digits only
    await user.type(codeInput(), "6");
    expect(submitBtn()).toBeEnabled();
  });

  it("works without ?email= (typed by hand, e.g. coming from the login page)", async () => {
    params = new URLSearchParams();
    const m = mockFetch({ "POST /api/auth/set-password": { activated: true } });
    renderWithProviders(<SetPasswordPage />);
    expect(emailInput()).toHaveValue("");
    const user = await fill();
    expect(submitBtn()).toBeDisabled(); // e-mail still missing
    await user.type(emailInput(), "me@org.org");
    await user.click(submitBtn());
    await waitFor(() => expect(m.calls).toHaveLength(1));
    expect(m.calls[0].body.email).toBe("me@org.org");
  });

  it("keeps only digits in the code: letters dropped, '123 456' and Arabic-Indic digits normalised, length capped", async () => {
    mockFetch({});
    renderWithProviders(<SetPasswordPage />);
    const user = userEvent.setup();
    await user.type(codeInput(), "12a3 4-5");
    expect(codeInput()).toHaveValue("12345");
    await user.clear(codeInput());
    await user.type(codeInput(), "١٢٣٤٥٦٧");
    expect(codeInput()).toHaveValue("123456");
  });

  it("shows which password rules are met while typing, and can reveal the password", async () => {
    mockFetch({});
    renderWithProviders(<SetPasswordPage />);
    const rules = screen.getByRole("list", { name: "شروط كلمة المرور" });
    expect(rules).toHaveTextContent("○ 8 أحرف على الأقل");
    const user = userEvent.setup();
    await user.type(passwordInput(), "abcdefgh");
    expect(rules).toHaveTextContent("✓ 8 أحرف على الأقل");
    expect(rules).toHaveTextContent("○ رقم واحد على الأقل");
    await user.type(passwordInput(), "1!");
    expect(rules).not.toHaveTextContent("○");

    await user.click(screen.getByRole("button", { name: "إظهار كلمة المرور" }));
    expect(passwordInput()).toHaveAttribute("type", "text");
    expect(confirmInput()).toHaveAttribute("type", "text");
  });

  it("validates locally and sends NOTHING for a weak password or a mismatch", async () => {
    const m = mockFetch({});
    renderWithProviders(<SetPasswordPage />);
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

  it("sends { email, code, password, password_confirmation } to POST /api/auth/set-password and goes to the login page with the e-mail pre-filled", async () => {
    const m = mockFetch({ "POST /api/auth/set-password": { activated: true, message: "تم تفعيل حسابك." } });
    renderWithProviders(<SetPasswordPage />);
    const user = await fill();
    await user.click(submitBtn());

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/login?activated=1&email=jalal%40org.org"));
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0].path).toBe("/api/auth/set-password");
    expect(m.calls[0].method).toBe("POST");
    expect(m.calls[0].body).toEqual({ email: "jalal@org.org", code: "123456", password: PASSWORD, password_confirmation: PASSWORD });
    expect(m.calls[0].url.startsWith("/api")).toBe(true); // same-origin BFF only
  });

  it("pressing Enter submits", async () => {
    const m = mockFetch({ "POST /api/auth/set-password": { activated: true } });
    renderWithProviders(<SetPasswordPage />);
    const user = await fill();
    await user.type(confirmInput(), "{Enter}");
    await waitFor(() => expect(m.calls).toHaveLength(1));
  });

  it("a wrong or expired code is shown under the code field; the form stays usable and the typed password is kept", async () => {
    mockFetch({
      "POST /api/auth/set-password": json(
        { message: "الرمز غير صحيح أو منتهي الصلاحية.", errors: { code: ["الرمز غير صحيح أو منتهي الصلاحية."] } },
        { status: 422 },
      ),
    });
    renderWithProviders(<SetPasswordPage />);
    const user = await fill();
    await user.click(submitBtn());

    expect(await screen.findByText("الرمز غير صحيح أو منتهي الصلاحية.")).toBeInTheDocument();
    expect(codeInput()).toBeEnabled();
    expect(codeInput()).toHaveAttribute("aria-invalid", "true");
    expect(passwordInput()).toHaveValue(PASSWORD);
    expect(router.push).not.toHaveBeenCalled();
    // typing a new code clears the error
    await user.type(codeInput(), "1");
    expect(screen.queryByText("الرمز غير صحيح أو منتهي الصلاحية.")).not.toBeInTheDocument();
  });

  it("a server-side password error lands on the password field", async () => {
    mockFetch({ "POST /api/auth/set-password": json({ message: "x", errors: { password: ["كلمة المرور ضعيفة."] } }, { status: 422 }) });
    renderWithProviders(<SetPasswordPage />);
    const user = await fill();
    await user.click(submitBtn());
    expect(await screen.findByText("كلمة المرور ضعيفة.")).toBeInTheDocument();
    expect(passwordInput()).toHaveAttribute("aria-invalid", "true");
  });

  it("after five wrong attempts (429) the code field is locked and the user is told to ask the admin for a new invitation", async () => {
    mockFetch({ "POST /api/auth/set-password": json({ message: "تجاوزت عدد المحاولات المسموح بها. اطلب رمزاً جديداً." }, { status: 429 }) });
    renderWithProviders(<SetPasswordPage />);
    const user = await fill();
    await user.click(submitBtn());

    expect(await screen.findByRole("alert")).toHaveTextContent("تجاوزت عدد المحاولات");
    expect(codeInput()).toBeDisabled();
    expect(codeInput()).toHaveValue("");
    expect(submitBtn()).toBeDisabled();
    expect(screen.getByText(/اطلب من مدير المنظمة إرسال دعوة جديدة/)).toBeInTheDocument();
  });

  it("a network failure shows the error banner and keeps the form usable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    renderWithProviders(<SetPasswordPage />);
    const user = await fill();
    await user.click(submitBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر الاتصال بالخادم");
    expect(submitBtn()).toBeEnabled();
  });

  it("SECURITY: neither the code nor the password is ever written to browser storage, and no other endpoint is called", async () => {
    const m = mockFetch({ "POST /api/auth/set-password": { activated: true } });
    renderWithProviders(<SetPasswordPage />);
    const user = await fill();
    await user.click(submitBtn());
    await waitFor(() => expect(router.push).toHaveBeenCalled());

    const everything = JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage });
    expect(everything).not.toContain(PASSWORD);
    expect(everything).not.toContain("123456");
    expect(router.push.mock.calls[0][0]).not.toContain("123456"); // the code is not put in the URL either
    expect(router.push.mock.calls[0][0]).not.toContain(encodeURIComponent(PASSWORD));
    expect(m.calls.map((c) => c.path)).toEqual(["/api/auth/set-password"]);
  });
});

describe("setPassword service", () => {
  it("maps the camelCase argument to the API's snake_case body and never sends the auth header path", async () => {
    const m = mockFetch({ "POST /api/auth/set-password": { activated: true } });
    await setPassword({ email: "a@b.org", code: "000001", password: PASSWORD, passwordConfirmation: PASSWORD });
    expect(m.calls[0].body).toEqual({ email: "a@b.org", code: "000001", password: PASSWORD, password_confirmation: PASSWORD });
  });
});
