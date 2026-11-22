// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";

import RootError from "@/app/error";
import GlobalError from "@/app/global-error";
import NotFound from "@/app/not-found";
import DashboardError from "@/app/dashboard/error";

afterEach(() => vi.restoreAllMocks());

const boom = Object.assign(new Error("secret stack detail"), { digest: "abc123" });

describe("error boundaries", () => {
  it.each([
    ["app/error.js", RootError],
    ["app/dashboard/error.js", DashboardError],
  ])("%s: shows a friendly Arabic message, never the raw error, with the digest and a working retry", async (_n, Component) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    render(<Component error={boom} unstable_retry={retry} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/secret stack detail/)).not.toBeInTheDocument();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(boom); // still reported to the console / monitoring hook

    await userEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("falls back to reset() when unstable_retry is not provided", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    render(<RootError error={boom} reset={reset} />);
    await userEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(reset).toHaveBeenCalled();
  });

  it("the dashboard boundary links back to /dashboard; the root one to /", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<DashboardError error={boom} unstable_retry={() => {}} />);
    expect(screen.getByRole("link", { name: "لوحة التحكم" })).toHaveAttribute("href", "/dashboard");
    unmount();
    render(<RootError error={boom} unstable_retry={() => {}} />);
    expect(screen.getByRole("link", { name: /الصفحة الرئيسية/ })).toHaveAttribute("href", "/");
  });

  it("global-error brings its own <html lang=ar dir=rtl> and body", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(<GlobalError error={boom} unstable_retry={() => {}} />);
    expect(html).toMatch(/^<html lang="ar" dir="rtl">/);
    expect(html).toContain("<body");
    expect(html).toContain("إعادة المحاولة");
    expect(html).not.toContain("secret stack detail");
  });
});

describe("not-found", () => {
  it("shows 404 with links home and to the dashboard", () => {
    render(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "الصفحة غير موجودة" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "الصفحة الرئيسية" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "لوحة التحكم" })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("button")).not.toBeInTheDocument(); // nothing to "retry" on a 404
  });
});
