// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { json, mockFetch } from "@/test/helpers";
import { renderWithProviders } from "@/test/render";

const router = { push: vi.fn(), replace: vi.fn() };
let params = new URLSearchParams("email=admin%40amal.org");
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => params }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));
// eslint-disable-next-line @next/next/no-img-element
vi.mock("next/image", () => ({ default: (p) => <img alt={p.alt} src={p.src} /> }));

import VerifyEmailPage from "@/app/verify-email/page";
import { registerOrganization, resendVerificationCode, verifyEmail } from "@/services/auth.service";

beforeEach(() => {
  sessionStorage.clear();
  params = new URLSearchParams("email=admin%40amal.org");
  Object.values(router).forEach((f) => f.mockClear());
});
afterEach(() => vi.unstubAllGlobals());

const codeInput = () => screen.getByLabelText(/رمز التحقق \(6 أرقام\)/);
const verifyBtn = () => screen.getByRole("button", { name: /تأكيد الرمز/ });
const resendBtn = () => screen.getByRole("button", { name: /إعادة إرسال الرمز/ });
const enter = async (digits) => {
  const user = userEvent.setup();
  await user.type(codeInput(), digits);
  return user;
};

describe("verify-email page (6-digit code)", () => {
  it("shows the registered e-mail and an empty numeric code field; confirm needs all 6 digits", async () => {
    mockFetch({});
    renderWithProviders(<VerifyEmailPage />);
    expect(screen.getByDisplayValue("admin@amal.org")).toBeDisabled();
    expect(codeInput()).toHaveValue("");
    expect(codeInput()).toHaveAttribute("inputmode", "numeric");
    expect(codeInput()).toHaveAttribute("autocomplete", "one-time-code");
    expect(verifyBtn()).toBeDisabled();
    await enter("12345");
    expect(verifyBtn()).toBeDisabled();
    await userEvent.setup().type(codeInput(), "6");
    expect(verifyBtn()).toBeEnabled();
  });

  it("keeps only digits: letters are dropped, a pasted '123 456' and Arabic-Indic digits are normalised, length is capped", async () => {
    mockFetch({});
    renderWithProviders(<VerifyEmailPage />);
    await enter("12a3 4-5");
    expect(codeInput()).toHaveValue("12345");
    const user = userEvent.setup();
    await user.clear(codeInput());
    await user.type(codeInput(), "١٢٣٤٥٦");
    expect(codeInput()).toHaveValue("123456");
    await user.clear(codeInput());
    await user.type(codeInput(), "1234567");
    expect(codeInput()).toHaveValue("123456");
  });

  it("sends { email, code } to POST /api/auth/verify-email and goes to the success page", async () => {
    const m = mockFetch({ "POST /api/auth/verify-email": { verified: true, message: "تم تفعيل البريد بنجاح." } });
    renderWithProviders(<VerifyEmailPage />);
    const user = await enter("123456");
    await user.click(verifyBtn());
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/activation-success?email=admin%40amal.org"));
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0].path).toBe("/api/auth/verify-email");
    expect(m.calls[0].body).toEqual({ email: "admin@amal.org", code: "123456" });
    expect(m.calls[0].url.startsWith("/api")).toBe(true); // same-origin BFF only
  });

  it("pressing Enter in the field submits", async () => {
    const m = mockFetch({ "POST /api/auth/verify-email": { verified: true } });
    renderWithProviders(<VerifyEmailPage />);
    const user = await enter("654321");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(m.calls).toHaveLength(1));
    expect(m.calls[0].body.code).toBe("654321");
  });

  it("a wrong or expired code shows the server message and stays on the page (field still usable)", async () => {
    mockFetch({
      "POST /api/auth/verify-email": json(
        { message: "الرمز غير صحيح أو منتهي الصلاحية.", errors: { code: ["الرمز غير صحيح أو منتهي الصلاحية."] } },
        { status: 422 },
      ),
    });
    renderWithProviders(<VerifyEmailPage />);
    const user = await enter("111111");
    await user.click(verifyBtn());
    expect(await screen.findByText("الرمز غير صحيح أو منتهي الصلاحية.")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(codeInput()).toBeEnabled();
    expect(codeInput()).toHaveAttribute("aria-invalid", "true");
    await user.type(codeInput(), "{Backspace}"); // editing clears the error state
    await waitFor(() => expect(codeInput()).toHaveAttribute("aria-invalid", "false"));
  });

  it("after 5 wrong attempts (429) the field is locked and cleared until a new code is requested", async () => {
    params = new URLSearchParams("email=admin%40amal.org&resend=1");
    const m = mockFetch({
      "POST /api/auth/verify-email": json({ message: "تجاوزت عدد المحاولات المسموح بها. اطلب رمزاً جديداً." }, { status: 429 }),
      "POST /api/auth/resend-verification": { message: "إذا كان البريد مسجلاً فسيصلك رمز تحقق جديد خلال لحظات.", expires_in_minutes: 15, resend_after_seconds: 60 },
    });
    renderWithProviders(<VerifyEmailPage />);
    const user = await enter("123456");
    await user.click(verifyBtn());

    expect((await screen.findAllByText(/تجاوزت عدد المحاولات المسموح بها/)).length).toBeGreaterThan(0);
    expect(codeInput()).toBeDisabled();
    expect(codeInput()).toHaveValue("");
    expect(verifyBtn()).toBeDisabled();
    expect(router.push).not.toHaveBeenCalled();

    await user.click(resendBtn());
    expect(await screen.findByText(/رمز تحقق جديد/)).toBeInTheDocument();
    expect(codeInput()).toBeEnabled(); // a fresh code unlocks the field
    expect(m.calls.map((c) => c.path)).toEqual(["/api/auth/verify-email", "/api/auth/resend-verification"]);
    expect(m.calls[1].body).toEqual({ email: "admin@amal.org" });
  });

  it("resend is disabled during the 60 s cooldown; with ?resend=1 (coming from the login page) it is available at once", async () => {
    mockFetch({});
    const { unmount } = renderWithProviders(<VerifyEmailPage />);
    expect(resendBtn()).toBeDisabled();
    expect(screen.getByText("01:00")).toBeInTheDocument();
    unmount();

    params = new URLSearchParams("email=admin%40amal.org&resend=1");
    renderWithProviders(<VerifyEmailPage />);
    expect(resendBtn()).toBeEnabled();
  });

  it("a successful resend shows the message, clears the field and restarts the countdown from the server's value", async () => {
    params = new URLSearchParams("email=admin%40amal.org&resend=1");
    mockFetch({ "POST /api/auth/resend-verification": { message: "تم إرسال رمز جديد.", expires_in_minutes: 15, resend_after_seconds: 45 } });
    renderWithProviders(<VerifyEmailPage />);
    const user = await enter("12");
    await user.click(resendBtn());
    expect(await screen.findByText(/تم إرسال رمز جديد/)).toBeInTheDocument();
    expect(codeInput()).toHaveValue("");
    expect(resendBtn()).toBeDisabled();
    expect(screen.getByText(/00:4\d/)).toBeInTheDocument();
  });

  it("a resend refused for the cooldown (429) starts the countdown from the seconds the server names", async () => {
    params = new URLSearchParams("email=admin%40amal.org&resend=1");
    mockFetch({ "POST /api/auth/resend-verification": json({ message: "يرجى الانتظار 30 ثانية قبل طلب رمز جديد." }, { status: 429 }) });
    renderWithProviders(<VerifyEmailPage />);
    await userEvent.setup().click(resendBtn());
    expect(await screen.findByText(/يرجى الانتظار 30 ثانية/)).toBeInTheDocument();
    await waitFor(() => expect(resendBtn()).toBeDisabled());
    expect(screen.getByText(/00:(29|30)/)).toBeInTheDocument();
  });

  it("resend for an already verified address says so and moves on to the success page", async () => {
    params = new URLSearchParams("email=admin%40amal.org&resend=1");
    mockFetch({ "POST /api/auth/resend-verification": json({ message: "البريد الإلكتروني مفعّل مسبقاً." }, { status: 400 }) });
    renderWithProviders(<VerifyEmailPage />);
    await userEvent.setup().click(resendBtn());
    expect(await screen.findByText(/مفعّل مسبقاً/)).toBeInTheDocument();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/activation-success?email=admin%40amal.org"), { timeout: 3000 });
  });

  it("a server error on resend is shown", async () => {
    params = new URLSearchParams("email=admin%40amal.org&resend=1");
    mockFetch({ "POST /api/auth/resend-verification": json({ message: "خطأ داخلي" }, { status: 500 }) });
    renderWithProviders(<VerifyEmailPage />);
    await userEvent.setup().click(resendBtn());
    expect(await screen.findByText(/خطأ داخلي/)).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("without an e-mail in the URL nothing is sent", async () => {
    params = new URLSearchParams("");
    const m = mockFetch({});
    renderWithProviders(<VerifyEmailPage />);
    const user = await enter("123456");
    await user.click(verifyBtn());
    expect(m.calls).toHaveLength(0);
  });

  it("SECURITY: the code is only ever sent to the same-origin auth endpoint — never stored, never in the URL", async () => {
    const m = mockFetch({ "POST /api/auth/verify-email": { verified: true } });
    renderWithProviders(<VerifyEmailPage />);
    const user = await enter("123456");
    await user.click(verifyBtn());
    await waitFor(() => expect(m.calls).toHaveLength(1));
    expect(m.calls[0].url).toBe("/api/auth/verify-email"); // no query string
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("123456");
    expect(JSON.stringify({ ...localStorage })).not.toContain("123456");
    expect(router.push.mock.calls[0][0]).not.toContain("123456");
    // the link-based verification is gone: no old endpoints are ever called
    expect(m.calls.some((c) => /verify-link|\/email\//.test(c.path))).toBe(false);
  });
});

describe("auth service helpers", () => {
  it("verifyEmail posts { email, code } to /api/auth/verify-email", async () => {
    const m = mockFetch({ "POST /api/auth/verify-email": { verified: true } });
    await verifyEmail({ email: "a@b.co", code: "004217" });
    expect(m.calls[0]).toMatchObject({ path: "/api/auth/verify-email", body: { email: "a@b.co", code: "004217" } }); // leading zeros survive
  });

  it("resendVerificationCode posts { email } to /api/auth/resend-verification", async () => {
    const m = mockFetch({ "POST /api/auth/resend-verification": { message: "x" } });
    await resendVerificationCode("a@b.co");
    expect(m.calls[0]).toMatchObject({ path: "/api/auth/resend-verification", body: { email: "a@b.co" } });
  });

  it("registerOrganization posts to /api/auth/register", async () => {
    const m = mockFetch({ "POST /api/auth/register": json({ message: "ok" }, { status: 201 }) });
    await registerOrganization({ admin_email: "a@b.co" });
    expect(m.calls[0].path).toBe("/api/auth/register");
  });
});
