// Real client addresses behind the Next.js server (TRUST_PROXY) and the platform-operator flag on the session user.
import { afterEach, describe, expect, it } from "vitest";
import { testApp, login, platformAdmin, signedInAdmin } from "./helpers.js";
import { loadEnv, parseTrustProxy } from "../src/config/env.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** An app with a diagnostic route that reports what the server believes about the caller. */
const appWith = (trust, env = {}) =>
  testApp({
    env: { TRUST_PROXY: trust, ...env },
    extend: (a) => a.get("/__ip", async (request) => ({ ip: request.ip, ips: request.ips ?? [request.ip] })),
  });
const ipSeenFor = async (peer, xff) =>
  (await app.inject({ url: "/__ip", remoteAddress: peer, headers: xff ? { "x-forwarded-for": xff } : {} })).json().ip;

describe("parseTrustProxy / loadEnv", () => {
  it.each([
    [undefined, false], ["", false], ["false", false], ["0", false], ["no", false], [false, false],
    ["true", true], ["1", true], ["YES", true], [true, true],
  ])("%s -> %s", (raw, expected) => expect(parseTrustProxy(raw)).toBe(expected));

  it("accepts a list of addresses, CIDR ranges (v4 and v6) and the loopback / linklocal / uniquelocal keywords", () => {
    expect(parseTrustProxy("loopback")).toEqual(["loopback"]);
    expect(parseTrustProxy("127.0.0.1, 10.0.0.0/8 ,fd00::/8, ::1")).toEqual(["127.0.0.1", "10.0.0.0/8", "fd00::/8", "::1"]);
    expect(parseTrustProxy("uniquelocal,linklocal")).toEqual(["uniquelocal", "linklocal"]);
  });

  it.each(["ture", "300.1.1.1", "10.0.0.0/33", "::1/129", "10.0.0.0/8/9", "10.0.0.0/x", "example.com", "127.0.0.1,bogus"])(
    "rejects %s instead of silently turning the protection off",
    (bad) => {
      expect(() => parseTrustProxy(bad)).toThrow(/is not an IP address/);
      expect(() => loadEnv({ NODE_ENV: "test", TRUST_PROXY: bad })).toThrow(/TRUST_PROXY/);
    },
  );

  it("loadEnv exposes the parsed value (default false)", () => {
    expect(loadEnv({ NODE_ENV: "test" }).TRUST_PROXY).toBe(false);
    expect(loadEnv({ NODE_ENV: "test", TRUST_PROXY: "loopback" }).TRUST_PROXY).toEqual(["loopback"]);
    expect(loadEnv({ NODE_ENV: "test", TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
  });
});

describe("request.ip", () => {
  it("TRUST_PROXY=false (default): X-Forwarded-For is ignored — everyone looks like the peer", async () => {
    app = await appWith("false");
    expect(await ipSeenFor("10.1.2.3", "203.0.113.7")).toBe("10.1.2.3");
  });

  it("a listed peer is believed: the forwarded address becomes the client's", async () => {
    app = await appWith("127.0.0.1");
    expect(await ipSeenFor("127.0.0.1", "203.0.113.7")).toBe("203.0.113.7");
    expect(await ipSeenFor("127.0.0.1")).toBe("127.0.0.1"); // nothing forwarded -> the peer itself
  });

  it("entries the client wrote itself are not believed: only the address the trusted proxy appended counts", async () => {
    app = await appWith("127.0.0.1");
    expect(await ipSeenFor("127.0.0.1", "6.6.6.6, 203.0.113.7")).toBe("203.0.113.7");
    expect(await ipSeenFor("127.0.0.1", "6.6.6.6, 7.7.7.7, 203.0.113.7")).toBe("203.0.113.7");
  });

  it("an UNLISTED peer cannot choose its address, whatever it sends", async () => {
    app = await appWith("127.0.0.1");
    expect(await ipSeenFor("198.51.100.9", "203.0.113.7")).toBe("198.51.100.9");
    expect(await ipSeenFor("198.51.100.9", "127.0.0.1")).toBe("198.51.100.9");
  });

  it("keywords and CIDR ranges select whole peer groups", async () => {
    app = await appWith("loopback");
    expect(await ipSeenFor("127.0.0.1", "203.0.113.7")).toBe("203.0.113.7");
    expect(await ipSeenFor("::1", "203.0.113.7")).toBe("203.0.113.7");
    expect(await ipSeenFor("10.0.0.5", "203.0.113.7")).toBe("10.0.0.5");
    await app.close();

    app = await appWith("10.0.0.0/8");
    expect(await ipSeenFor("10.200.1.1", "203.0.113.7")).toBe("203.0.113.7");
    expect(await ipSeenFor("11.0.0.1", "203.0.113.7")).toBe("11.0.0.1");
  });

  it("DOCUMENTED RISK — TRUST_PROXY=true believes anyone: a direct caller forges its address (use a list instead)", async () => {
    app = await appWith("true");
    expect(await ipSeenFor("198.51.100.9", "6.6.6.6")).toBe("6.6.6.6");
  });
});

describe("per-IP rate limits follow the client, not the proxy", () => {
  const verify = (i, peer, xff) =>
    app.inject({
      method: "POST",
      url: "/auth/verify-email",
      payload: { email: `u${i}@x.org`, code: "123456" }, // a new address each time: only the per-IP ceiling can trip
      remoteAddress: peer,
      headers: xff ? { "x-forwarded-for": xff } : {},
    });
  const statuses = async (n, peer, xff) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push((await verify(`${peer}-${xff}-${i}`, peer, xff)).statusCode);
    return out;
  };

  it("behind a trusted proxy each real client has its own bucket (30 / 10 min), so one noisy client cannot lock everyone out", async () => {
    app = await appWith("127.0.0.1", { RATE_LIMIT_SCALE: "1" });
    const a = await statuses(31, "127.0.0.1", "203.0.113.7");
    expect(a.slice(0, 30).every((s) => s === 422)).toBe(true);
    expect(a[30]).toBe(429); // client A is limited...
    expect(await statuses(3, "127.0.0.1", "203.0.113.8")).toEqual([422, 422, 422]); // ...client B is not
  });

  it("without TRUST_PROXY everyone behind the proxy shares ONE bucket (the bug this setting fixes)", async () => {
    app = await appWith("false", { RATE_LIMIT_SCALE: "1" });
    await statuses(30, "127.0.0.1", "203.0.113.7");
    expect(await statuses(1, "127.0.0.1", "203.0.113.8")).toEqual([429]); // a different client is already locked out
  });

  it("a caller that is not the trusted proxy cannot dodge the limit by rotating forged addresses", async () => {
    app = await appWith("127.0.0.1", { RATE_LIMIT_SCALE: "1" });
    const out = [];
    for (let i = 0; i < 32; i++) out.push((await verify(i, "198.51.100.9", `203.0.113.${i}`)).statusCode);
    expect(out.slice(0, 30).every((s) => s === 422)).toBe(true);
    expect(out[30]).toBe(429);
  });
});

describe("is_platform_admin on the session user (the frontend routes operators away from the dashboard)", () => {
  it("true for a platform operator on /login and /auth/me, false for an organization admin", async () => {
    app = await testApp();
    const ops = await platformAdmin(app);
    const org = await signedInAdmin(app);

    const opsLogin = (await login(app, "ops@masar.io")).json();
    expect(opsLogin.user).toMatchObject({ is_platform_admin: true, onboarding_status: "approved", role: "مشرف المنصة" });
    expect((await app.inject({ url: "/auth/me", headers: ops.headers })).json().user.is_platform_admin).toBe(true);

    expect((await login(app, "admin@org.org")).json().user.is_platform_admin).toBe(false);
    expect((await app.inject({ url: "/auth/me", headers: org.headers })).json().user.is_platform_admin).toBe(false);
  });

  it("the operator still cannot use the business API (403) — hence the operator page instead of the dashboard", async () => {
    app = await testApp();
    const ops = await platformAdmin(app);
    for (const url of ["/dashboard/summary", "/requests", "/employees"]) {
      expect((await app.inject({ url, headers: ops.headers })).statusCode, url).toBe(403);
    }
    expect((await app.inject({ url: "/platform/organizations", headers: ops.headers })).statusCode).toBe(200);
  });
});
