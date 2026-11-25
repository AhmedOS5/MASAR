import { describe, expect, it } from "vitest";
import { isSameSiteRequest } from "@/lib/server/csrf";

const req = (method, headers = {}) => ({ method, headers: new Headers(headers) });
const HOST = { host: "masar.example" };

describe("isSameSiteRequest", () => {
  it("never blocks reads", () => {
    expect(isSameSiteRequest(req("GET", { ...HOST, origin: "https://evil.example" }))).toBe(true);
    expect(isSameSiteRequest(req("HEAD", { ...HOST, "sec-fetch-site": "cross-site" }))).toBe(true);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("%s from the same origin passes", (method) => {
    expect(isSameSiteRequest(req(method, { ...HOST, origin: "https://masar.example" }))).toBe(true);
  });

  it("a mutation from another site is refused (Origin)", () => {
    expect(isSameSiteRequest(req("POST", { ...HOST, origin: "https://evil.example" }))).toBe(false);
    expect(isSameSiteRequest(req("DELETE", { ...HOST, origin: "https://masar.example.evil.example" }))).toBe(false);
  });

  it("an opaque or malformed Origin is refused", () => {
    expect(isSameSiteRequest(req("POST", { ...HOST, origin: "null" }))).toBe(false);
    expect(isSameSiteRequest(req("POST", { ...HOST, origin: "not a url" }))).toBe(false);
  });

  it("falls back to Sec-Fetch-Site when there is no Origin", () => {
    expect(isSameSiteRequest(req("POST", { ...HOST, "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameSiteRequest(req("POST", { ...HOST, "sec-fetch-site": "none" }))).toBe(true);
    expect(isSameSiteRequest(req("POST", { ...HOST, "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameSiteRequest(req("POST", { ...HOST, "sec-fetch-site": "same-site" }))).toBe(false);
  });

  it("a non-browser client (no Origin, no Sec-Fetch-Site) is allowed", () => {
    expect(isSameSiteRequest(req("POST", HOST))).toBe(true);
  });

  it("behind a reverse proxy the forwarded host is the one the browser used", () => {
    const h = { host: "internal:3000", "x-forwarded-host": "masar.example, proxy.internal", origin: "https://masar.example" };
    expect(isSameSiteRequest(req("POST", h))).toBe(true);
    expect(isSameSiteRequest(req("POST", { ...h, origin: "https://evil.example" }))).toBe(false);
  });
});
