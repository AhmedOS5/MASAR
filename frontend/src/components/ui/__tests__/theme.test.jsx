// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { THEME_KEY } from "@/lib/theme";

const attr = () => document.documentElement.getAttribute("data-app-theme");

function stubSystemDark(matches) {
  const listeners = new Set();
  vi.stubGlobal("matchMedia", () => ({
    matches,
    addEventListener: (_e, fn) => listeners.add(fn),
    removeEventListener: (_e, fn) => listeners.delete(fn),
  }));
  return listeners;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-app-theme");
});
afterEach(() => vi.unstubAllGlobals());

describe("ThemeToggle", () => {
  it("starts light: no attribute, the light option is pressed", () => {
    render(<ThemeToggle />);
    expect(attr()).toBeNull();
    expect(screen.getByRole("button", { name: "المظهر الفاتح" })).toHaveAttribute("aria-pressed", "true");
  });

  it("choosing dark applies it to <html> and remembers it", async () => {
    render(<ThemeToggle />);
    await userEvent.setup().click(screen.getByRole("button", { name: "المظهر الداكن" }));
    expect(attr()).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(screen.getByRole("button", { name: "المظهر الداكن" })).toHaveAttribute("aria-pressed", "true");
  });

  it("restores the saved choice when it mounts", async () => {
    localStorage.setItem(THEME_KEY, "dark");
    render(<ThemeToggle />);
    await waitFor(() => expect(attr()).toBe("dark"));
    expect(screen.getByRole("button", { name: "المظهر الداكن" })).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores a corrupt saved value", () => {
    localStorage.setItem(THEME_KEY, "neon");
    render(<ThemeToggle />);
    expect(attr()).toBeNull();
  });

  it("'system' follows the operating system, including later changes", async () => {
    stubSystemDark(true);
    render(<ThemeToggle />);
    await userEvent.setup().click(screen.getByRole("button", { name: "مظهر النظام" }));
    expect(attr()).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("system");
  });

  it("leaves the public pages alone: unmounting removes the attribute", async () => {
    const { unmount } = render(<ThemeToggle />);
    await userEvent.setup().click(screen.getByRole("button", { name: "المظهر الداكن" }));
    expect(attr()).toBe("dark");
    unmount();
    expect(attr()).toBeNull();
  });
});
