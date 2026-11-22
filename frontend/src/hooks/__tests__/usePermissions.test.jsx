// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { mockFetch } from "@/test/helpers";
import { renderWithProviders } from "@/test/render";
import usePermissions from "../usePermissions";

function probe() {
  const box = {};
  function Probe() {
    Object.assign(box, usePermissions());
    return null;
  }
  renderWithProviders(<Probe />);
  return box;
}

async function permissionsFor(user) {
  mockFetch({ "GET /api/auth/session": { user, organization: { name: "منظمة" }, onboarding_status: "approved" } });
  const p = probe();
  await waitFor(() => expect(p.known).toBe(true));
  return p;
}

describe("usePermissions", () => {
  it("answers from the permission keys in the session", async () => {
    const p = await permissionsFor({ permissions: ["requests.view", "tasks.view"], is_system_admin: false });
    expect(p.can("requests.view")).toBe(true);
    expect(p.can("requests.approve")).toBe(false);
    expect(p.canAny("employees.view", "tasks.view")).toBe(true);
    expect(p.canAny("employees.view", "roles.view")).toBe(false);
    expect(p.isAdmin).toBe(false);
  });

  it("a system admin can do everything", async () => {
    const p = await permissionsFor({ permissions: [], is_system_admin: true });
    expect(p.can("projects.manage")).toBe(true);
    expect(p.isAdmin).toBe(true);
  });

  it("is permissive while the list is unknown (nothing is hidden wrongly; the backend still decides)", () => {
    mockFetch({ "GET /api/auth/session": { user: { name: "x" } } });
    const p = probe();
    expect(p.known).toBe(false);
    expect(p.can("anything")).toBe(true);
  });
});
