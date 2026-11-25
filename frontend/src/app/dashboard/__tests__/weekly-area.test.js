import { describe, expect, it } from "vitest";
import { areaPaths, niceMax } from "@/app/dashboard/_components/WeeklyActivity";

describe("areaPaths (stacked weekly activity)", () => {
  const week = [
    { date: "2026-03-01", requests: 4, tasks: 6 }, // oldest day
    { date: "2026-03-02", requests: 15, tasks: 5 },
  ];

  it("the oldest day is plotted on the RIGHT (the page is RTL; SVG x runs left to right)", () => {
    const p = areaPaths(week, 20);
    expect(p.totalLine.startsWith("M450.0 ")).toBe(true); // column 1 of 2 on the right: x = 600 * 1.5 / 2
    expect(p.totalLine.includes("L150.0 ")).toBe(true); // newest day on the left
  });

  it("the top edge is the daily total and the lower edge is the tasks (y grows downward, 200 = the baseline)", () => {
    const p = areaPaths(week, 20);
    expect(p.totalLine).toBe("M450.0 100.0 L150.0 0.0"); // totals 10 and 20 on a 0..20 axis
    expect(p.tasksLine).toBe("M450.0 140.0 L150.0 150.0"); // tasks 6 and 5
  });

  it("values above the axis are clamped, never drawn outside the chart", () => {
    expect(areaPaths([{ requests: 100, tasks: 100 }], 10).totalLine).toBe("M300.0 0.0");
  });

  it("niceMax rounds the axis up to 1/2/5 x 10^n", () => {
    expect(niceMax(0)).toBe(5);
    expect(niceMax(20)).toBe(20);
    expect(niceMax(27)).toBe(50);
    expect(niceMax(7)).toBe(10);
  });
});
