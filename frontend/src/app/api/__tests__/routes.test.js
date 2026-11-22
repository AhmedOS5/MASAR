import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";
import { GET as proxyGET, POST as proxyPOST } from "@/app/api/[...path]/route";
import { json, mockFetch } from "@/test/helpers";

const API = "https://api.masar.example";

beforeEach(() => {
  process.env.API_URL = API;
  delete process.env.NEXT_PUBLIC_API_URL;
});
afterEach(() => vi.unstubAllGlobals());

const req = (url, { method = "GET", body, cookies, headers = {} } = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      ...(body !== undefined && typeof body !== "string" ? { "Content-Type": "application/json" } : {}),
      ...(cookies ? { cookie: cookies } : {}),
      ...headers,
    },
  });
const ctx = (...path) => ({ params: Promise.resolve({ path }) });
const setCookies = (res) => res.headers.getSetCookie();

describe("POST /api/auth/login", () => {
  it("rejects missing credentials with 422 and never calls the backend", async () => {
    const m = mockFetch({});
    const res = await loginPOST(req("/api/auth/login", { method: "POST", body: { email: "a@b.c" } }));
    expect(res.status).toBe(422);
    expect(m.calls).toHaveLength(0);
  });

  it("maps credentials to the Laravel fields, stores the token ONLY in HttpOnly cookies, and hides it from JS", async () => {
    const m = mockFetch({
      "POST /login": { token: "SECRET-TOKEN", user: { name: "Ahmed", onboarding_status: "approved" } },
    });
    const res = await loginPOST(
      req("/api/auth/login", { method: "POST", body: { email: " admin@org.org ", password: "pw", remember: true } }),
    );
    const body = await res.json();

    expect(m.calls[0].url).toBe(`${API}/login`);
    expect(m.calls[0].body).toEqual({ admin_email: "admin@org.org", admin_password: "pw" });

    expect(res.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("SECRET-TOKEN");
    expect(body).toMatchObject({ onboarding_status: "approved", redirect: "/dashboard" });

    const cookies = setCookies(res).join("\n");
    expect(cookies).toMatch(/auth_token=SECRET-TOKEN/);
    expect(cookies).toMatch(/onboarding_status=approved/);
    expect(cookies.match(/HttpOnly/gi)).toHaveLength(2);
    expect(cookies).toMatch(/SameSite=lax/i);
    expect(cookies).toMatch(/Max-Age=2592000/); // remember me => 30 days
  });

  it("uses a session cookie (no Max-Age) when 'remember me' is off", async () => {
    mockFetch({ "POST /login": { token: "t", user: { onboarding_status: "approved" } } });
    const res = await loginPOST(req("/api/auth/login", { method: "POST", body: { email: "a@b.c", password: "x" } }));
    expect(setCookies(res).join("\n")).not.toMatch(/Max-Age/i);
  });

  it("routes a user who has not finished onboarding to /onboarding", async () => {
    mockFetch({ "POST /login": { token: "t", user: { onboarding_status: "incomplete" } } });
    const res = await loginPOST(req("/api/auth/login", { method: "POST", body: { email: "a@b.c", password: "x" } }));
    expect((await res.json()).redirect).toBe("/onboarding");
  });

  it("asks /auth/me for the status when /login does not include it", async () => {
    const m = mockFetch({
      "POST /login": { token: "t" },
      "GET /auth/me": (r) => {
        expect(r.init.headers.Authorization).toBe("Bearer t");
        return { user: { name: "A", onboarding_status: "under_review" } };
      },
    });
    const res = await loginPOST(req("/api/auth/login", { method: "POST", body: { email: "a@b.c", password: "x" } }));
    expect(m.calls.map((c) => c.path)).toEqual(["/login", "/auth/me"]);
    expect((await res.json()).redirect).toBe("/onboarding/waiting-approval");
  });

  it("passes wrong-credential errors through and sets NO cookies", async () => {
    mockFetch({ "POST /login": json({ message: "بيانات الدخول غير صحيحة" }, { status: 401 }) });
    const res = await loginPOST(req("/api/auth/login", { method: "POST", body: { email: "a@b.c", password: "bad" } }));
    expect(res.status).toBe(401);
    expect((await res.json()).message).toContain("غير صحيحة");
    expect(setCookies(res)).toHaveLength(0);
  });

  it("returns 502 when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const res = await loginPOST(req("/api/auth/login", { method: "POST", body: { email: "a@b.c", password: "x" } }));
    expect(res.status).toBe(502);
  });

  it("returns 500 with a clear message when API_URL is missing", async () => {
    delete process.env.API_URL;
    const res = await loginPOST(req("/api/auth/login", { method: "POST", body: { email: "a@b.c", password: "x" } }));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/auth/session", () => {
  it("is 401 without a session cookie", async () => {
    const m = mockFetch({});
    const res = await sessionGET(req("/api/auth/session"));
    expect(res.status).toBe(401);
    expect(m.calls).toHaveLength(0);
  });

  it("returns the user and refreshes the onboarding cookie", async () => {
    mockFetch({
      "GET /auth/me": (r) => {
        expect(r.init.headers.Authorization).toBe("Bearer T");
        return { user: { name: "A", onboarding_status: "approved" }, organization: { name: "Org" } };
      },
    });
    const res = await sessionGET(req("/api/auth/session", { cookies: "auth_token=T; onboarding_status=pending_approval" }));
    const body = await res.json();
    expect(body.user.name).toBe("A");
    expect(body.organization.name).toBe("Org");
    expect(body.onboarding_status).toBe("approved");
    expect(setCookies(res).join("\n")).toMatch(/onboarding_status=approved/);
  });

  it("clears both cookies when the backend says the token is no longer valid", async () => {
    mockFetch({ "GET /auth/me": json({ message: "Unauthenticated" }, { status: 401 }) });
    const res = await sessionGET(req("/api/auth/session", { cookies: "auth_token=expired" }));
    expect(res.status).toBe(401);
    const cookies = setCookies(res).join("\n");
    expect(cookies).toMatch(/auth_token=;/);
    expect(cookies).toMatch(/onboarding_status=;/);
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the token upstream (best effort) and clears cookies", async () => {
    const m = mockFetch({ "POST /logout": { ok: true } });
    const res = await logoutPOST(req("/api/auth/logout", { method: "POST", cookies: "auth_token=T" }));
    expect(m.calls[0].init.headers.Authorization).toBe("Bearer T");
    expect(setCookies(res).join("\n")).toMatch(/auth_token=;/);
  });

  it("still clears cookies when the backend is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const res = await logoutPOST(req("/api/auth/logout", { method: "POST", cookies: "auth_token=T" }));
    expect(res.status).toBe(200);
    expect(setCookies(res).join("\n")).toMatch(/auth_token=;/);
  });
});

describe("/api/[...path] proxy", () => {
  it("attaches the Bearer token from the HttpOnly cookie, forwards the query string", async () => {
    const m = mockFetch({ "GET /requests": { data: [], meta: { total: 0 } } });
    const res = await proxyGET(req("/api/requests?status=pending&page=2", { cookies: "auth_token=TOK" }), ctx("requests"));
    expect(res.status).toBe(200);
    expect(m.calls[0].url).toBe(`${API}/requests?status=pending&page=2`);
    expect(m.calls[0].init.headers.Authorization).toBe("Bearer TOK");
  });

  it("sends no Authorization header when there is no session", async () => {
    const m = mockFetch({ "POST /register-organization": { ok: true } });
    await proxyPOST(req("/api/register-organization", { method: "POST", body: { organization_name: "X" } }), ctx("register-organization"));
    expect(m.calls[0].init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(Buffer.from(m.calls[0].init.body).toString())).toEqual({ organization_name: "X" });
  });

  it("forwards backend validation errors untouched (422)", async () => {
    mockFetch({ "POST /requests": json({ message: "invalid", errors: { title: ["مطلوب"] } }, { status: 422 }) });
    const res = await proxyPOST(req("/api/requests", { method: "POST", body: {}, cookies: "auth_token=T" }), ctx("requests"));
    expect(res.status).toBe(422);
    expect((await res.json()).errors.title).toEqual(["مطلوب"]);
  });

  it("refuses to proxy /login (it would leak the token to client JS)", async () => {
    const m = mockFetch({});
    for (const path of [["login"], ["auth", "login"]]) {
      const res = await proxyPOST(req("/api/login", { method: "POST", body: { admin_email: "a", admin_password: "b" } }), ctx(...path));
      expect(res.status).toBe(404);
    }
    expect(m.calls).toHaveLength(0);
  });

  it("rejects path traversal / encoded slashes", async () => {
    const m = mockFetch({});
    for (const path of [["..", "etc"], [".", "x"], ["a%2F..%2Fb"], ["a", "..%2F..%2Fsecret"]]) {
      const res = await proxyGET(req("/api/x", { cookies: "auth_token=T" }), ctx(...path));
      expect(res.status).toBe(400);
    }
    expect(m.calls).toHaveLength(0);
  });

  it("clears the session cookies when the backend answers 401", async () => {
    mockFetch({ "GET /tasks": json({ message: "Unauthenticated" }, { status: 401 }) });
    const res = await proxyGET(req("/api/tasks", { cookies: "auth_token=old" }), ctx("tasks"));
    expect(res.status).toBe(401);
    expect(setCookies(res).join("\n")).toMatch(/auth_token=;/);
  });

  it("marks the user as pending_approval after a successful onboarding submission", async () => {
    mockFetch({ "POST /organization/o": { ok: true } });
    const res = await proxyPOST(
      req("/api/organization/o", { method: "POST", body: { organization_name: "X" }, cookies: "auth_token=T; onboarding_status=pending_onboarding" }),
      ctx("organization", "o"),
    );
    expect(setCookies(res).join("\n")).toMatch(/onboarding_status=pending_approval/);
  });

  it("does NOT change the onboarding status when the submission fails", async () => {
    mockFetch({ "POST /organization/o": json({ message: "bad" }, { status: 422 }) });
    const res = await proxyPOST(
      req("/api/organization/o", { method: "POST", body: {}, cookies: "auth_token=T" }),
      ctx("organization", "o"),
    );
    expect(res.status).toBe(422);
    expect(setCookies(res).join("\n")).not.toMatch(/pending_approval/);
  });

  it("streams binary downloads with their headers", async () => {
    mockFetch({
      "GET /files/9/download": new Response("PDFDATA", {
        status: 200,
        headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="a.pdf"' },
      }),
    });
    const res = await proxyGET(req("/api/files/9/download", { cookies: "auth_token=T" }), ctx("files", "9", "download"));
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("a.pdf");
    expect(await res.text()).toBe("PDFDATA");
  });

  it("returns 502 when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const res = await proxyGET(req("/api/requests", { cookies: "auth_token=T" }), ctx("requests"));
    expect(res.status).toBe(502);
  });
});

describe("the visitor's address reaches the backend (per-IP rate limits)", () => {
  const withHops = (hops) => {
    beforeEach(() => {
      process.env.TRUSTED_PROXY_HOPS = hops;
    });
    afterEach(() => {
      delete process.env.TRUSTED_PROXY_HOPS;
    });
  };

  describe("behind one trusted proxy", () => {
    withHops("1");
    const xff = { "x-forwarded-for": "6.6.6.6, 203.0.113.7" }; // "6.6.6.6" was written by the visitor, the last entry by the proxy
    const forwarded = (m) => m.calls.map((c) => c.init.headers["X-Forwarded-For"]);

    it("the generic proxy forwards ONLY the vouched-for address, never the visitor's raw header", async () => {
      const m = mockFetch({ "GET /requests": { data: [] } });
      await proxyGET(req("/api/requests", { cookies: "auth_token=T", headers: xff }), ctx("requests"));
      expect(forwarded(m)).toEqual(["203.0.113.7"]);
    });

    it("so does public traffic (registration, verification codes)", async () => {
      const m = mockFetch({ "POST /auth/verify-email": { verified: true } });
      await proxyPOST(req("/api/auth/verify-email", { method: "POST", body: { email: "a@b.co", code: "123456" }, headers: xff }), ctx("auth", "verify-email"));
      expect(forwarded(m)).toEqual(["203.0.113.7"]);
    });

    it("login forwards it on /login and on the /auth/me fallback", async () => {
      const m = mockFetch({ "POST /login": { token: "t" }, "GET /auth/me": { user: { onboarding_status: "approved" } } });
      await loginPOST(req("/api/auth/login", { method: "POST", body: { email: "a@b.c", password: "x" }, headers: xff }));
      expect(m.calls.map((c) => c.path)).toEqual(["/login", "/auth/me"]);
      expect(forwarded(m)).toEqual(["203.0.113.7", "203.0.113.7"]);
    });

    it("session refresh and logout forward it too", async () => {
      const m = mockFetch({ "GET /auth/me": { user: { onboarding_status: "approved" } }, "POST /logout": { ok: true } });
      await sessionGET(req("/api/auth/session", { cookies: "auth_token=T", headers: xff }));
      await logoutPOST(req("/api/auth/logout", { method: "POST", cookies: "auth_token=T", headers: xff }));
      expect(forwarded(m)).toEqual(["203.0.113.7", "203.0.113.7"]);
    });

    it("sends no address when the header is missing or malformed (the backend then sees this server)", async () => {
      const m = mockFetch({ "GET /requests": { data: [] } });
      await proxyGET(req("/api/requests", { cookies: "auth_token=T" }), ctx("requests"));
      await proxyGET(req("/api/requests", { cookies: "auth_token=T", headers: { "x-forwarded-for": "6.6.6.6, not-an-ip" } }), ctx("requests"));
      expect(forwarded(m)).toEqual([undefined, undefined]);
    });
  });

  describe("directly reachable server (no trusted proxy: local development)", () => {
    withHops("0");
    it("ignores a visitor-supplied X-Forwarded-For entirely — it could be anything", async () => {
      const m = mockFetch({ "GET /requests": { data: [] } });
      await proxyGET(req("/api/requests", { cookies: "auth_token=T", headers: { "x-forwarded-for": "203.0.113.7" } }), ctx("requests"));
      expect(m.calls[0].init.headers["X-Forwarded-For"]).toBeUndefined();
    });
  });
});

describe("platform operators are routed to the operator page", () => {
  it("login: is_platform_admin -> redirect /operator, cookie status 'operator' (whatever the organization status says)", async () => {
    mockFetch({ "POST /login": { token: "t", user: { name: "فريق مسار", onboarding_status: "approved", is_platform_admin: true } } });
    const res = await loginPOST(req("/api/auth/login", { method: "POST", body: { email: "ops@masar.io", password: "x" } }));
    const body = await res.json();
    expect(body).toMatchObject({ onboarding_status: "operator", redirect: "/operator" });
    expect(setCookies(res).join("\n")).toMatch(/onboarding_status=operator/);
  });

  it("login: operator status also found through the /auth/me fallback", async () => {
    mockFetch({ "POST /login": { token: "t" }, "GET /auth/me": { user: { onboarding_status: "approved", is_platform_admin: true } } });
    const res = await loginPOST(req("/api/auth/login", { method: "POST", body: { email: "ops@masar.io", password: "x" } }));
    expect((await res.json()).redirect).toBe("/operator");
  });

  it("login: organization users are unaffected (is_platform_admin false / absent)", async () => {
    mockFetch({ "POST /login": { token: "t", user: { onboarding_status: "approved", is_platform_admin: false } } });
    const res = await loginPOST(req("/api/auth/login", { method: "POST", body: { email: "a@b.c", password: "x" } }));
    expect((await res.json()).redirect).toBe("/dashboard");
  });

  it("session refresh repairs a stale cookie: a session that still says 'approved' becomes 'operator'", async () => {
    mockFetch({ "GET /auth/me": { user: { name: "Ops", onboarding_status: "approved", is_platform_admin: true } } });
    const res = await sessionGET(req("/api/auth/session", { cookies: "auth_token=T; onboarding_status=approved" }));
    const body = await res.json();
    expect(body.onboarding_status).toBe("operator");
    expect(body.user.is_platform_admin).toBe(true);
    expect(setCookies(res).join("\n")).toMatch(/onboarding_status=operator/);
  });
});
