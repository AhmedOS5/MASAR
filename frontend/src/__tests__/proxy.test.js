import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "@/proxy";

const call = (path, cookie) =>
  proxy(new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} }));

const location = (res) => (res.headers.get("location") ? new URL(res.headers.get("location")) : null);

describe("src/proxy.js (the actual guard)", () => {
  it("only runs on protected paths", () => {
    expect(config.matcher).toEqual(["/dashboard/:path*", "/onboarding/:path*", "/operator/:path*"]);
  });

  it("redirects an unauthenticated request for /dashboard to /login?next=/dashboard", () => {
    const res = call("/dashboard");
    expect(res.status).toBe(307);
    const loc = location(res);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/dashboard");
  });

  it("blocks every dashboard sub-route without a session", () => {
    for (const p of [
      "/dashboard/requests",
      "/dashboard/requests/REQ-1",
      "/dashboard/tasks/7",
      "/dashboard/employees",
      "/dashboard/roles",
      "/dashboard/files",
      "/dashboard/reports",
      "/dashboard/notifications",
      "/dashboard/units",
      "/dashboard/meal",
      "/dashboard/meal/complaints",
      "/dashboard/meal/field-data",
      "/dashboard/meal/indicators",
      "/dashboard/meal/reports",
    ]) {
      const res = call(p);
      expect(res.status, p).toBe(307);
      expect(location(res).pathname, p).toBe("/login");
    }
  });

  it("blocks /onboarding and /onboarding/waiting-approval without a session", () => {
    expect(location(call("/onboarding")).pathname).toBe("/login");
    expect(location(call("/onboarding/waiting-approval")).pathname).toBe("/login");
  });

  it("a forged status cookie WITHOUT a token does not grant access", () => {
    const res = call("/dashboard", "onboarding_status=approved");
    expect(location(res).pathname).toBe("/login");
  });

  it("lets an approved, authenticated user in", () => {
    const res = call("/dashboard/requests", "auth_token=T; onboarding_status=approved");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("keeps pending-approval users out of the dashboard", () => {
    const res = call("/dashboard", "auth_token=T; onboarding_status=pending_approval");
    expect(location(res).pathname).toBe("/onboarding/waiting-approval");
  });

  it("platform operators are kept out of the dashboard and onboarding and sent to /operator", () => {
    const cookie = "auth_token=T; onboarding_status=operator";
    for (const p of ["/dashboard", "/dashboard/requests", "/onboarding", "/onboarding/waiting-approval"]) {
      const res = call(p, cookie);
      expect(res.status, p).toBe(307);
      expect(location(res).pathname, p).toBe("/operator");
    }
    expect(call("/operator", cookie).status).toBe(200); // ...and /operator itself is open to them
  });

  it("/operator needs a session, and is closed to organization users", () => {
    const anon = call("/operator");
    expect(location(anon).pathname).toBe("/login");
    expect(location(anon).searchParams.get("next")).toBe("/operator");
    expect(location(call("/operator", "onboarding_status=operator")).pathname).toBe("/login"); // a forged cookie alone grants nothing
    expect(location(call("/operator", "auth_token=T; onboarding_status=approved")).pathname).toBe("/dashboard");
    expect(location(call("/operator", "auth_token=T; onboarding_status=pending_approval")).pathname).toBe("/onboarding/waiting-approval");
  });

  it("keeps un-onboarded users on the onboarding form", () => {
    const res = call("/dashboard/tasks", "auth_token=T; onboarding_status=pending_onboarding");
    expect(location(res).pathname).toBe("/onboarding");
  });
});
