import { describe, expect, it } from "vitest";
import { clientIp, forwardedFor, normalizeIp, trustedProxyHops } from "@/lib/server/client-ip";

const headers = (xff) => new Headers(xff === undefined ? {} : { "x-forwarded-for": xff });

describe("trustedProxyHops", () => {
  it("is 0 by default (no proxy is trusted: local development)", () => {
    expect(trustedProxyHops({})).toBe(0);
  });
  it("defaults to 1 on Vercel, whose edge sets X-Forwarded-For itself", () => {
    expect(trustedProxyHops({ VERCEL: "1" })).toBe(1);
  });
  it("TRUSTED_PROXY_HOPS wins over the platform default", () => {
    expect(trustedProxyHops({ VERCEL: "1", TRUSTED_PROXY_HOPS: "2" })).toBe(2);
    expect(trustedProxyHops({ VERCEL: "1", TRUSTED_PROXY_HOPS: "0" })).toBe(0);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "1" })).toBe(1);
  });
  it.each(["abc", "-1", "1.5", "11", "99", "NaN"])("a malformed value (%s) never turns trust on", (raw) => {
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: raw })).toBe(0);
  });
  it("an empty value falls back to the platform default", () => {
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "  ", VERCEL: "1" })).toBe(1);
  });
});

describe("normalizeIp", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    [" 203.0.113.7 ", "203.0.113.7"],
    ["203.0.113.7:5521", "203.0.113.7"],
    ["2001:db8::1", "2001:db8::1"],
    ["[2001:db8::1]:443", "2001:db8::1"],
    ["[2001:db8::1]", "2001:db8::1"],
    ["::ffff:203.0.113.7", "::ffff:203.0.113.7"],
  ])("%s -> %s", (raw, expected) => expect(normalizeIp(raw)).toBe(expected));

  it.each(["", "unknown", "evil.example", "999.1.1.1", "1.2.3", "203.0.113.7, 6.6.6.6", "<script>", "1.2.3.4/32", undefined, null])(
    "rejects %s (never forwards something that is not an address)",
    (raw) => expect(normalizeIp(raw)).toBeNull(),
  );
});

describe("clientIp: the address vouched for by the trusted proxies", () => {
  it("trusts nothing without trusted proxies (a visitor can send any X-Forwarded-For to a directly reachable server)", () => {
    expect(clientIp(headers("203.0.113.7"), 0)).toBeNull();
    expect(clientIp(headers("6.6.6.6, 203.0.113.7"), 0)).toBeNull();
  });

  it("one trusted proxy: the LAST entry — the one that proxy appended", () => {
    expect(clientIp(headers("203.0.113.7"), 1)).toBe("203.0.113.7");
    expect(clientIp(headers("2001:db8::1"), 1)).toBe("2001:db8::1");
  });

  it("entries written by the visitor (to the left) are ignored: forging a prefix does not help", () => {
    expect(clientIp(headers("6.6.6.6"), 1)).toBe("6.6.6.6"); // nothing to its left, so it IS what the proxy saw
    expect(clientIp(headers("6.6.6.6, 7.7.7.7, 203.0.113.7"), 1)).toBe("203.0.113.7");
    expect(clientIp(headers("127.0.0.1, 203.0.113.7"), 1)).toBe("203.0.113.7");
  });

  it("two trusted proxies: the second entry from the right", () => {
    expect(clientIp(headers("6.6.6.6, 203.0.113.7, 10.0.0.9"), 2)).toBe("203.0.113.7");
  });

  it("fewer entries than trusted proxies means the request did not take the expected path: unknown, not a guess", () => {
    expect(clientIp(headers("203.0.113.7"), 2)).toBeNull();
    expect(clientIp(headers(""), 1)).toBeNull();
    expect(clientIp(headers(undefined), 1)).toBeNull();
  });

  it("a garbage value at the trusted position is dropped rather than forwarded", () => {
    expect(clientIp(headers("203.0.113.7, evil.example"), 1)).toBeNull();
    expect(clientIp(headers("203.0.113.7, unknown"), 1)).toBeNull();
  });

  it("strips a port, tolerates spaces and empty items", () => {
    expect(clientIp(headers(" 6.6.6.6 , ,203.0.113.7:5521 "), 1)).toBe("203.0.113.7");
  });
});

describe("forwardedFor (what is sent to the backend)", () => {
  const request = (xff) => ({ headers: headers(xff) });

  it("is empty when the address is unknown (the backend then sees this server, as before)", () => {
    expect(forwardedFor(request("203.0.113.7"))).toEqual({}); // hops = 0 in the test environment
  });

  it("is built from scratch: ONE address, never the visitor's raw header", () => {
    const saved = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = "1";
    try {
      expect(forwardedFor(request("6.6.6.6, 203.0.113.7"))).toEqual({ "X-Forwarded-For": "203.0.113.7" });
      expect(forwardedFor(request(undefined))).toEqual({});
    } finally {
      if (saved === undefined) delete process.env.TRUSTED_PROXY_HOPS;
      else process.env.TRUSTED_PROXY_HOPS = saved;
    }
  });
});
