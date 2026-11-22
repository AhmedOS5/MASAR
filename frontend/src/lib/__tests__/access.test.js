import { describe, expect, it } from "vitest";
import { evaluateAccess } from "@/lib/access";

const run = (pathname, token, rawStatus) => evaluateAccess({ pathname, token, rawStatus });

describe("route guard decisions (evaluateAccess)", () => {
  it("lets public pages through", () => {
    for (const p of ["/", "/login", "/register", "/verify-email", "/api/requests"]) {
      expect(run(p, undefined, undefined)).toBeNull();
    }
  });

  it("blocks unauthenticated access to every protected route and remembers where they were going", () => {
    const protectedPaths = [
      "/dashboard",
      "/dashboard/requests",
      "/dashboard/requests/REQ-1",
      "/dashboard/meal/complaints",
      "/onboarding",
      "/onboarding/waiting-approval",
    ];
    for (const p of protectedPaths) {
      expect(run(p, undefined, "approved")).toEqual({ redirect: "/login", withNext: true });
      expect(run(p, "", undefined)).toEqual({ redirect: "/login", withNext: true });
    }
  });

  it("does not treat look-alike paths as protected", () => {
    expect(run("/dashboardx", undefined, undefined)).toBeNull();
    expect(run("/onboarding-info", undefined, undefined)).toBeNull();
  });

  it("sends pending-approval users to the waiting screen instead of the dashboard", () => {
    expect(run("/dashboard", "t", "pending_approval")).toEqual({ redirect: "/onboarding/waiting-approval" });
    expect(run("/dashboard/tasks", "t", "pending_approval")).toEqual({ redirect: "/onboarding/waiting-approval" });
    expect(run("/onboarding", "t", "pending_approval")).toEqual({ redirect: "/onboarding/waiting-approval" });
    expect(run("/onboarding/waiting-approval", "t", "pending_approval")).toBeNull();
  });

  it("sends users who have not finished onboarding to the form", () => {
    expect(run("/dashboard", "t", "pending_onboarding")).toEqual({ redirect: "/onboarding" });
    expect(run("/onboarding", "t", "pending_onboarding")).toBeNull();
    expect(run("/onboarding/waiting-approval", "t", "pending_onboarding")).toEqual({ redirect: "/onboarding" });
  });

  describe("platform operators (staff of the platform, no organization)", () => {
    it("their only screen is /operator: the dashboard and onboarding are closed to them", () => {
      expect(run("/operator", "t", "operator")).toBeNull();
      for (const p of ["/dashboard", "/dashboard/requests", "/dashboard/meal/complaints", "/onboarding", "/onboarding/waiting-approval"]) {
        expect(run(p, "t", "operator"), p).toEqual({ redirect: "/operator" });
      }
    });

    it("/operator needs a session, and remembers where the visitor was going", () => {
      expect(run("/operator", undefined, "operator")).toEqual({ redirect: "/login", withNext: true });
      expect(run("/operator/anything", "", undefined)).toEqual({ redirect: "/login", withNext: true });
    });

    it("everyone else is sent home from /operator", () => {
      expect(run("/operator", "t", "approved")).toEqual({ redirect: "/dashboard" });
      expect(run("/operator", "t", "pending_approval")).toEqual({ redirect: "/onboarding/waiting-approval" });
      expect(run("/operator", "t", "pending_onboarding")).toEqual({ redirect: "/onboarding" });
      expect(run("/operator/x", "t", undefined)).toEqual({ redirect: "/dashboard" }); // a missing status means approved
    });

    it("look-alike paths are not protected", () => {
      expect(run("/operators", undefined, undefined)).toBeNull();
      expect(run("/operator-info", undefined, undefined)).toBeNull();
    });
  });

  it("sends approved users away from onboarding and into the dashboard", () => {
    expect(run("/onboarding", "t", "approved")).toEqual({ redirect: "/dashboard" });
    expect(run("/onboarding/waiting-approval", "t", "completed")).toEqual({ redirect: "/dashboard" });
    expect(run("/dashboard", "t", "approved")).toBeNull();
    expect(run("/dashboard/meal", "t", "approved")).toBeNull();
  });
});
