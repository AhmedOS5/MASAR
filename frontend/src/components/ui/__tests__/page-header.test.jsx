// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PageHeader from "@/components/ui/PageHeader";
import { BADGE_TONE, badgeTone, TASK_STATUS, PRIORITY, REQUEST_STATUS } from "@/lib/labels";

describe("PageHeader", () => {
  it("renders the title as the single h1 with its subtitle", () => {
    render(<PageHeader title="الطلبات" subtitle="تابع طلبات العمل" />);
    expect(screen.getByRole("heading", { level: 1, name: "الطلبات" })).toBeInTheDocument();
    expect(screen.getByText("تابع طلبات العمل")).toBeInTheDocument();
  });

  it("renders primary and secondary actions together, and no action area when there are none", () => {
    const { container, rerender } = render(
      <PageHeader title="س" primary={<button type="button">جديد</button>} secondary={<button type="button">تصدير</button>} />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["تصدير", "جديد"]); // secondary first, primary last (inline-end)

    rerender(<PageHeader title="س" primary={false} secondary={null} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("shows badge, meta and the contextual toolbar when given", () => {
    render(
      <PageHeader
        title="مشروع"
        badge={<span>نشط</span>}
        meta={<span>PRJ-1</span>}
        toolbar={<input aria-label="بحث" />}
      />,
    );
    expect(screen.getByText("نشط")).toBeInTheDocument();
    expect(screen.getByText("PRJ-1")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "بحث" })).toBeInTheDocument();
  });

  it("can render a nested page heading as h2", () => {
    render(<PageHeader title="فرعي" as="h2" />);
    const h = screen.getByRole("heading", { name: "فرعي" });
    expect(h.tagName).toBe("H2");
    expect(within(h.closest("header")).queryByRole("heading", { level: 1 })).toBeNull();
  });
});

describe("badge tones", () => {
  it("every legacy status / priority tone maps to a shared badge variant", () => {
    const variants = new Set(["success", "warning", "danger", "info", "neutral"]);
    const tones = [...Object.values(TASK_STATUS), ...Object.values(PRIORITY), ...Object.values(REQUEST_STATUS)].map((x) => x.tone);
    for (const t of tones) expect(variants.has(badgeTone(t))).toBe(true);
    expect(Object.values(BADGE_TONE).every((v) => variants.has(v))).toBe(true);
  });

  it("falls back to neutral for an unknown tone", () => {
    expect(badgeTone("nope")).toBe("neutral");
    expect(badgeTone(undefined)).toBe("neutral");
  });
});
