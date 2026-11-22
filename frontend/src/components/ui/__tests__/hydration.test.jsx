// @vitest-environment jsdom
// Regression tests for React hydration error #418 on /dashboard, /dashboard/meal and /register.
// Pages such as /dashboard are pre-rendered at BUILD time, so anything date- or storage-dependent in the first render
// is frozen into the HTML and disagrees with the browser's first render on every later day.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import TodayDate from "@/components/ui/TodayDate";
import { formatDate } from "@/lib/format";

const OPTS = { weekday: "long", day: "numeric", month: "long", year: "numeric" };

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** Pre-render `element` "at build time", then hydrate it in the browser on `browserDay`. */
async function hydrateOn(buildDay, browserDay, element) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(buildDay);
  const html = renderToString(element);
  vi.setSystemTime(browserDay);

  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  const recoverable = [];
  let root;
  await act(async () => {
    root = hydrateRoot(container, element, { onRecoverableError: (e) => recoverable.push(e) });
  });
  return { container, recoverable, html, unmount: () => act(() => root.unmount()) };
}

const BUILD_DAY = new Date(2026, 0, 1, 12);
const LATER_DAY = new Date(2026, 10, 15, 12);

describe("hydration safety of date rendering", () => {
  it("CONTROL: a naive `new Date()` in the markup does mismatch (the harness can detect #418)", async () => {
    const Naive = () => <p>{formatDate(new Date().toISOString(), OPTS)}</p>;
    const { recoverable, unmount } = await hydrateOn(BUILD_DAY, LATER_DAY, <Naive />);
    expect(recoverable.length).toBeGreaterThan(0);
    await unmount();
  });

  it("<TodayDate> pre-renders empty, hydrates cleanly on a different day and then shows the browser's date", async () => {
    const el = <p><TodayDate options={OPTS} /></p>;
    const { container, recoverable, html, unmount } = await hydrateOn(BUILD_DAY, LATER_DAY, el);

    expect(html).not.toMatch(/2026/); // the build date is never frozen into the HTML
    expect(recoverable).toEqual([]);
    expect(container.textContent).toContain("2026");
    expect(container.textContent).toContain("15"); // 15 November, the browser's day
    await unmount();
  });
});
