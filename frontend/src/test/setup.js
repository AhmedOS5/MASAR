import { afterEach } from "vitest";

// jest-dom matchers + automatic DOM cleanup only matter in jsdom test files.
if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
  // jsdom lacks layout APIs the UI calls.
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  window.scrollTo = () => {};
}
