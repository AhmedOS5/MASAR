// @vitest-environment jsdom
// "My account": every signed-in user can change their own password (no permission needed).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { json, mockFetch } from "@/test/helpers";
import { renderWithProviders } from "@/test/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/account",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));

import AccountPage from "@/app/dashboard/account/page";

afterEach(() => vi.unstubAllGlobals());

// a plain employee: no permissions at all
const SESSION = { user: { id: 7, name: "سارة", email: "sara@org.org", is_system_admin: false, permissions: [] }, organization: { name: "منظمة النور" }, onboarding_status: "approved" };
const fill = async (user, { current = "Old#Pass1", next = "New#Pass2", confirm = next } = {}) => {
  await user.type(await screen.findByLabelText(/كلمة المرور الحالية/), current);
  await user.type(screen.getByLabelText(/^كلمة المرور الجديدة/), next);
  await user.type(screen.getByLabelText(/تأكيد كلمة المرور الجديدة/), confirm);
};
const submit = () => screen.getByRole("button", { name: "تغيير كلمة المرور" });

describe("account page", () => {
  it("is open to a user without any permission and shows who is signed in", async () => {
    mockFetch({ "GET /api/auth/session": SESSION });
    renderWithProviders(<AccountPage />);
    expect(await screen.findByText(/sara@org.org/)).toBeInTheDocument();
    expect(screen.getByLabelText(/كلمة المرور الحالية/)).toBeInTheDocument();
  });

  it("keeps the button disabled until the new password meets the rules and matches its confirmation", async () => {
    mockFetch({ "GET /api/auth/session": SESSION });
    renderWithProviders(<AccountPage />);
    const user = userEvent.setup();
    await fill(user, { next: "weak", confirm: "weak" });
    expect(submit()).toBeDisabled();
    await user.clear(screen.getByLabelText(/^كلمة المرور الجديدة/));
    await user.type(screen.getByLabelText(/^كلمة المرور الجديدة/), "New#Pass2");
    expect(screen.getByText("كلمتا المرور غير متطابقتين.")).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it("sends the three fields to POST /auth/change-password and clears the form on success", async () => {
    const m = mockFetch({ "GET /api/auth/session": SESSION, "POST /api/auth/change-password": { changed: true, message: "ok" } });
    renderWithProviders(<AccountPage />);
    const user = userEvent.setup();
    await fill(user);
    await user.click(submit());
    await waitFor(() => expect(m.calls.filter((c) => c.method === "POST" && c.path === "/api/auth/change-password")).toHaveLength(1));
    expect(m.calls.find((c) => c.path === "/api/auth/change-password").body).toEqual({
      current_password: "Old#Pass1",
      password: "New#Pass2",
      password_confirmation: "New#Pass2",
    });
    await waitFor(() => expect(screen.getByLabelText(/كلمة المرور الحالية/)).toHaveValue(""));
  });

  it("shows the server's message under the current-password field when it is wrong", async () => {
    mockFetch({
      "GET /api/auth/session": SESSION,
      "POST /api/auth/change-password": json({ message: "x", errors: { current_password: ["كلمة المرور الحالية غير صحيحة."] } }, { status: 422 }),
    });
    renderWithProviders(<AccountPage />);
    const user = userEvent.setup();
    await fill(user);
    await user.click(submit());
    expect(await screen.findByText("كلمة المرور الحالية غير صحيحة.")).toBeInTheDocument();
    expect(screen.getByLabelText(/كلمة المرور الحالية/)).toHaveValue("Old#Pass1"); // nothing is lost
  });

  it("shows a throttling error (429) as a message, not a crash", async () => {
    mockFetch({ "GET /api/auth/session": SESSION, "POST /api/auth/change-password": json({ message: "محاولات كثيرة، حاول لاحقاً." }, { status: 429 }) });
    renderWithProviders(<AccountPage />);
    const user = userEvent.setup();
    await fill(user);
    await user.click(submit());
    expect(await screen.findByText("محاولات كثيرة، حاول لاحقاً.")).toBeInTheDocument();
  });
});
