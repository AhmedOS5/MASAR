import { describe, expect, it } from "vitest";
import { homeForStatus, normalizeOnboardingStatus, safeNextPath, statusForUser } from "@/lib/session";

describe("normalizeOnboardingStatus", () => {
  it.each([
    ["approved", "approved"],
    ["completed", "approved"],
    ["APPROVED", "approved"],
    ["pending_approval", "pending_approval"],
    ["under_review", "pending_approval"],
    ["submitted", "pending_approval"],
    ["incomplete", "pending_onboarding"],
    ["draft", "pending_onboarding"],
    ["something-unknown", "pending_onboarding"],
    ["operator", "operator"],
    ["platform_admin", "operator"],
    [undefined, "approved"],
    [null, "approved"],
    ["", "approved"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizeOnboardingStatus(raw)).toBe(expected);
  });

  it("maps each status to its home route", () => {
    expect(homeForStatus("approved")).toBe("/dashboard");
    expect(homeForStatus("pending_approval")).toBe("/onboarding/waiting-approval");
    expect(homeForStatus("pending_onboarding")).toBe("/onboarding");
    expect(homeForStatus("operator")).toBe("/operator");
  });
});

describe("statusForUser", () => {
  it("a platform operator is recognised by the flag, whatever organization status the backend reports", () => {
    for (const raw of ["approved", "incomplete", "pending_approval", undefined]) {
      expect(statusForUser({ is_platform_admin: true }, raw)).toBe("operator");
    }
  });

  it("everyone else keeps the normalised onboarding status", () => {
    expect(statusForUser({ is_platform_admin: false }, "pending_approval")).toBe("pending_approval");
    expect(statusForUser({}, "incomplete")).toBe("pending_onboarding");
    expect(statusForUser(null, undefined)).toBe("approved");
    expect(statusForUser({ is_platform_admin: "yes" }, "approved")).toBe("approved"); // only a real boolean true counts
  });
});

describe("safeNextPath (open-redirect protection)", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNextPath("/dashboard/requests")).toBe("/dashboard/requests");
    expect(safeNextPath("/onboarding")).toBe("/onboarding");
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "dashboard",
    "",
    null,
    undefined,
    42,
  ])("rejects %s", (bad) => {
    expect(safeNextPath(bad)).toBe("/dashboard");
  });
});
