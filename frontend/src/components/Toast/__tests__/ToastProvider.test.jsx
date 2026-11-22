// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/Toast/ToastProvider";

afterEach(() => vi.useRealTimers());

function Fire({ type = "success", message = "تم" }) {
  const toast = useToast();
  return <button onClick={() => toast[type](message)}>fire</button>;
}

describe("ToastProvider timers", () => {
  it("auto-dismisses a toast after its delay", () => {
    vi.useFakeTimers();
    render(<ToastProvider><Fire /></ToastProvider>);
    act(() => screen.getByText("fire").click());
    expect(screen.getByText("تم")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3600));
    expect(screen.queryByText("تم")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("closing a toast by hand cancels its pending timer", () => {
    vi.useFakeTimers();
    render(<ToastProvider><Fire type="error" message="فشل" /></ToastProvider>);
    act(() => screen.getByText("fire").click());
    expect(vi.getTimerCount()).toBe(1);
    act(() => screen.getByLabelText("إغلاق").click());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves NO timer behind when the provider unmounts (it used to fire after the test environment was gone)", () => {
    vi.useFakeTimers();
    const { unmount } = render(<ToastProvider><Fire /></ToastProvider>);
    act(() => screen.getByText("fire").click());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
