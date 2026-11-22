import { afterEach, describe, expect, it } from "vitest";
import { testApp, testDb, testEnv } from "./helpers.js";
import { loadEnv } from "../src/config/env.js";
import { ValidationError, HttpError, notFound } from "../src/lib/errors.js";
import { parse, z, text, optText, email, optNumber, dateOnly, optId } from "../src/lib/validate.js";
import { pageParams, paginate, applySearch } from "../src/lib/pagination.js";
import { nextCode } from "../src/lib/sequence.js";
import { iso } from "../src/lib/time.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("app shell", () => {
  it("GET /health is ok and also reachable under the /api prefix", async () => {
    app = await testApp();
    for (const url of ["/health", "/api/health"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ok" });
    }
  });

  it("sends no-store and security headers", async () => {
    app = await testApp();
    const res = await app.inject({ url: "/health" });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("unknown route -> 404 { message }", async () => {
    app = await testApp();
    const res = await app.inject({ method: "GET", url: "/nope?x=1" });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toContain("GET /nope");
  });

  it("malformed JSON -> 400 with a message, not a 500", async () => {
    app = await testApp({ extend: (a) => a.post("/__t", async (r) => r.body) });
    const res = await app.inject({ method: "POST", url: "/__t", headers: { "content-type": "application/json" }, payload: "{bad" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ message: expect.any(String) });
  });

  it("oversized JSON body -> 413", async () => {
    app = await testApp({ extend: (a) => a.post("/__t", async (r) => r.body) });
    const res = await app.inject({ method: "POST", url: "/__t", headers: { "content-type": "application/json" }, payload: JSON.stringify({ x: "a".repeat(1024 * 1024 + 10) }) });
    expect(res.statusCode).toBe(413);
  });
});

describe("error mapping", () => {
  const routes = (a) => {
    a.get("/__t/validation", async () => {
      throw parse(z.object({ title: text(), amount: optNumber({ max: 10 }) }), { title: "", amount: 99 });
    });
    a.get("/__t/http", async () => {
      throw notFound("الطلب غير موجود");
    });
    a.get("/__t/boom", async () => {
      throw new Error("secret db password in message");
    });
  };

  it("ValidationError -> Laravel 422 shape with per-field arrays", async () => {
    app = await testApp({ extend: routes });
    const res = await app.inject({ url: "/__t/validation" });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.message).toBeTruthy();
    expect(body.errors.title).toEqual(["الحقل مطلوب."]);
    expect(body.errors.amount).toEqual([expect.stringContaining("10")]);
  });

  it("HttpError keeps its status and message", async () => {
    app = await testApp({ extend: routes });
    const res = await app.inject({ url: "/__t/http" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ message: "الطلب غير موجود" });
  });

  it("unexpected errors -> 500; details hidden in production", async () => {
    app = await testApp({ extend: routes });
    expect((await app.inject({ url: "/__t/boom" })).json().debug).toContain("secret");
    await app.close();

    app = await testApp({ extend: routes, patch: { isProd: true } });
    const body = (await app.inject({ url: "/__t/boom" })).json();
    expect(body.debug).toBeUndefined();
    expect(body.message).toBeTruthy();
  });
});

describe("validation helpers", () => {
  it("treats blank strings as absent and trims", () => {
    const schema = z.object({ a: text(), b: optText(), c: optId(), d: dateOnly(), e: email() });
    const out = parse(schema, { a: "  hi ", b: "", c: "", d: "2026-03-05T10:00:00Z", e: " A@B.org " });
    expect(out).toEqual({ a: "hi", b: undefined, c: undefined, d: "2026-03-05", e: "a@b.org" });
  });

  it("reports nested paths and Arabic messages", () => {
    try {
      parse(z.object({ tags: z.array(z.string()).min(1), e: email() }), { tags: [], e: "nope" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.status).toBe(422);
      expect(err.errors.e).toEqual(["بريد إلكتروني غير صالح."]);
      expect(err.errors.tags).toBeTruthy();
    }
  });
});

describe("environment", () => {
  it("applies defaults", () => {
    const env = testEnv();
    expect(env.PORT).toBe(4010);
    expect(env.maxUploadBytes).toBe(10 * 1024 * 1024);
  });

  it("production demands a signing secret, postgres and no test controls", () => {
    expect(() => loadEnv({ NODE_ENV: "production" })).toThrow(/SIGNING_SECRET/);
    expect(() => loadEnv({ NODE_ENV: "production", SIGNING_SECRET: "s".repeat(32) })).toThrow(/DATABASE_URL/);
    expect(() =>
      loadEnv({ NODE_ENV: "production", SIGNING_SECRET: "s".repeat(32), DATABASE_URL: "postgres://u@h/d", SMTP_HOST: "smtp.example.com", ENABLE_TEST_CONTROLS: "true" }),
    ).toThrow(/ENABLE_TEST_CONTROLS/);
    expect(() => loadEnv({ NODE_ENV: "production", SIGNING_SECRET: "s".repeat(32), DATABASE_URL: "postgres://u@h/d" })).toThrow(/SMTP_HOST/);
    expect(loadEnv({ NODE_ENV: "production", SIGNING_SECRET: "s".repeat(32), DATABASE_URL: "postgres://u@h/d", SMTP_HOST: "smtp.example.com" }).isProd).toBe(true);
  });
});

describe("migrations", () => {
  const TABLES = [
    "organizations", "organization_profiles", "roles", "role_permissions", "users", "auth_tokens", "options", "counters",
    "requests", "request_comments", "request_activities", "tasks", "task_comments", "attachments", "notifications",
    "folders", "files", "reports", "units", "org_units",
    "complaints", "indicators", "meal_reports", "report_templates", "field_records",
  ];

  it("create every table and roll back cleanly", async () => {
    const db = await testDb();
    for (const t of TABLES) expect(await db.schema.hasTable(t), t).toBe(true);
    await db.migrate.rollback(undefined, true);
    for (const t of TABLES) expect(await db.schema.hasTable(t), t).toBe(false);
    await db.migrate.latest(); // and forward again
    expect(await db.schema.hasTable("organizations")).toBe(true);
    await db.destroy();
  });

  it("enforce foreign keys and tenant cascade", async () => {
    const db = await testDb();
    await expect(db("roles").insert({ organization_id: 999, title: "x" })).rejects.toThrow();
    const [org] = await db("organizations").insert({ name: "A", email: "a@a.org" }, ["id"]);
    const orgId = org.id;
    const [{ id: projectId }] = await db("projects").insert({ organization_id: orgId, code: "PRJ-001", name: "p" }, ["id"]);
    await db("requests").insert({ organization_id: orgId, code: "REQ-001", title: "t", project_id: projectId });
    await expect(db("requests").insert({ organization_id: orgId, code: "REQ-001", title: "dup", project_id: projectId })).rejects.toThrow();
    await expect(db("requests").insert({ organization_id: orgId, code: "REQ-002", title: "no project" })).rejects.toThrow(/NOT NULL|not-null/i);
    await db("organizations").where({ id: orgId }).del();
    expect(Number((await db("requests").count({ n: "*" }).first()).n)).toBe(0);
    await db.destroy();
  });

  it("user deletion keeps their requests/tasks (SET NULL)", async () => {
    const db = await testDb();
    const [{ id: orgId }] = await db("organizations").insert({ name: "A", email: "a@a.org" }, ["id"]);
    const [{ id: uid }] = await db("users").insert({ organization_id: orgId, name: "U", email: "u@a.org" }, ["id"]);
    const [{ id: projectId }] = await db("projects").insert({ organization_id: orgId, code: "PRJ-001", name: "p" }, ["id"]);
    await db("tasks").insert({ organization_id: orgId, code: "TSK-001", title: "t", assignee_id: uid, project_id: projectId });
    await db("users").where({ id: uid }).del();
    expect((await db("tasks").first()).assignee_id).toBeNull();
    await db.destroy();
  });
});

describe("sequences", () => {
  it("issue gapless, per-org, per-key codes", async () => {
    const db = await testDb();
    const [{ id: a }] = await db("organizations").insert({ name: "A", email: "a@a.org" }, ["id"]);
    const [{ id: b }] = await db("organizations").insert({ name: "B", email: "b@b.org" }, ["id"]);
    expect(await nextCode(db, a, "request", "REQ")).toBe("REQ-001");
    expect(await nextCode(db, a, "request", "REQ")).toBe("REQ-002");
    expect(await nextCode(db, b, "request", "REQ")).toBe("REQ-001");
    expect(await nextCode(db, a, "task", "TSK")).toBe("TSK-001");
    expect(await nextCode(db, a, "complaint", "FCRM", { start: 900 })).toBe("FCRM-900");
    expect(await nextCode(db, a, "complaint", "FCRM", { start: 900 })).toBe("FCRM-901");
    // concurrent callers never collide
    const codes = await Promise.all(Array.from({ length: 10 }, () => nextCode(db, a, "request", "REQ")));
    expect(new Set(codes).size).toBe(10);
    await db.destroy();
  });

  it("roll back together with a failed transaction", async () => {
    const db = await testDb();
    const [{ id: a }] = await db("organizations").insert({ name: "A", email: "a@a.org" }, ["id"]);
    await db.transaction(async (trx) => {
      await nextCode(trx, a, "request", "REQ");
      throw new Error("abort");
    }).catch(() => {});
    expect(await nextCode(db, a, "request", "REQ")).toBe("REQ-001");
    await db.destroy();
  });
});

describe("pagination", () => {
  it("clamps page params", () => {
    expect(pageParams({})).toEqual({ page: 1, perPage: 10 });
    expect(pageParams({ page: "3", per_page: "25" })).toEqual({ page: 3, perPage: 25 });
    expect(pageParams({ page: "-4", per_page: "99999" })).toEqual({ page: 1, perPage: 100 });
    expect(pageParams({ page: "abc", per_page: "0" })).toEqual({ page: 1, perPage: 10 });
  });

  it("returns contract meta, filters, search and extras", async () => {
    const db = await testDb();
    const [{ id: org }] = await db("organizations").insert({ name: "A", email: "a@a.org" }, ["id"]);
    const [{ id: project }] = await db("projects").insert({ organization_id: org, code: "PRJ-001", name: "p" }, ["id"]);
    await db("requests").insert(
      Array.from({ length: 23 }, (_, i) => ({
        organization_id: org,
        project_id: project,
        code: `REQ-${String(i + 1).padStart(3, "0")}`,
        title: i === 4 ? "100% شراء_خاص" : `طلب ${i + 1}`,
        status: i % 2 ? "pending" : "approved",
      })),
    );
    const base = () => db("requests").where({ organization_id: org }).orderBy("id");

    const p3 = await paginate(base(), { page: 3, perPage: 10 });
    expect(p3.data).toHaveLength(3);
    expect(p3.meta).toMatchObject({ total: 23, current_page: 3, last_page: 3, per_page: 10 });

    const pending = await paginate(base().where({ status: "pending" }), { page: 1, perPage: 5 }, (r) => r.map((x) => x.code), { status_counts: { pending: 11 } });
    expect(pending.meta).toMatchObject({ total: 11, last_page: 3, status_counts: { pending: 11 } });
    expect(pending.data[0]).toBe("REQ-002");

    // LIKE wildcards in user input are matched literally
    expect((await paginate(applySearch(base(), "100%", ["title"]), { page: 1, perPage: 10 })).meta.total).toBe(1);
    expect((await paginate(applySearch(base(), "%", ["title"]), { page: 1, perPage: 10 })).meta.total).toBe(1);
    expect((await paginate(applySearch(base(), "REQ-02", ["code", "title"]), { page: 1, perPage: 10 })).meta.total).toBe(4);
    expect((await paginate(applySearch(base(), "all", ["title"]), { page: 1, perPage: 10 })).meta.total).toBe(23);

    const empty = await paginate(base().where({ status: "none" }), { page: 1, perPage: 10 });
    expect(empty).toEqual({ data: [], meta: { total: 0, current_page: 1, per_page: 10, last_page: 1 } });
    await db.destroy();
  });
});

describe("time", () => {
  it("normalises SQLite and PostgreSQL timestamps to ISO-8601 UTC", () => {
    expect(iso("2026-03-05 10:20:30")).toBe("2026-03-05T10:20:30Z");
    expect(iso(new Date("2026-03-05T10:20:30.000Z"))).toBe("2026-03-05T10:20:30.000Z");
    expect(iso(null)).toBeNull();
    expect(iso("2026-03-05T10:20:30.000Z")).toBe("2026-03-05T10:20:30.000Z");
  });
});

it("HttpError defaults its message from the status", () => {
  expect(new HttpError(403).message).toMatch(/صلاحية/);
});
