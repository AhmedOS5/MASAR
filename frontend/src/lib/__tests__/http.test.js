// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, http, listOf, metaOf, toFieldErrors, unwrap } from "@/lib/http";
import { json, mockFetch } from "@/test/helpers";

afterEach(() => vi.unstubAllGlobals());

describe("http client", () => {
  it("calls the same-origin BFF and parses JSON", async () => {
    const m = mockFetch({ "GET /api/requests": { data: [{ id: 1 }] } });
    const res = await http("/requests");
    expect(res.data).toHaveLength(1);
    expect(m.last().url).toBe("/api/requests");
    expect(m.last().init.credentials).toBe("same-origin");
  });

  it("serialises query params and skips empty / 'all' values", async () => {
    const m = mockFetch({ "GET /api/requests": { data: [] } });
    await http("/requests", { query: { status: "pending", priority: "all", search: "", page: 2, x: undefined } });
    expect(m.last().url).toBe("/api/requests?status=pending&page=2");
  });

  it("sends JSON bodies with a content type, but leaves FormData untouched", async () => {
    const m = mockFetch({ "POST /api/requests": { id: 1 }, "POST /api/files": { id: 2 } });
    await http("/requests", { method: "POST", body: { title: "x" } });
    expect(m.last().init.headers["Content-Type"]).toBe("application/json");
    expect(m.last().body).toEqual({ title: "x" });

    const fd = new FormData();
    fd.append("file", new Blob(["a"]), "a.txt");
    await http("/files", { method: "POST", body: fd });
    expect(m.last().init.body).toBe(fd);
    expect(m.last().init.headers["Content-Type"]).toBeUndefined();
  });

  it("turns Laravel validation errors into ApiError.fieldErrors", async () => {
    mockFetch({
      "POST /api/requests": json(
        { message: "invalid", errors: { title: ["العنوان مطلوب"], type: ["النوع مطلوب", "x"] } },
        { status: 422 },
      ),
    });
    const err = await http("/requests", { method: "POST", body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.fieldErrors).toEqual({ title: "العنوان مطلوب", type: "النوع مطلوب" });
    expect(err.message).toContain("العنوان مطلوب");
  });

  it("uses the server message for non-validation errors and a fallback otherwise", async () => {
    mockFetch({
      "GET /api/a": json({ message: "غير مسموح" }, { status: 403 }),
      "GET /api/b": json("oops", { status: 500 }),
    });
    expect((await http("/a").catch((e) => e)).message).toBe("غير مسموح");
    expect((await http("/b").catch((e) => e)).message).toContain("500");
  });

  it("reports network failures with a friendly Arabic message (status 0)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await http("/requests").catch((e) => e);
    expect(err.status).toBe(0);
    expect(err.message).toContain("تعذر الاتصال");
  });

  it("returns null for 204", async () => {
    mockFetch({ "DELETE /api/employees/1": new Response(null, { status: 204 }) });
    expect(await http("/employees/1", { method: "DELETE" })).toBeNull();
  });

  it("on 401 it logs out (clears the cookie) then redirects to /login with ?next=", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/dashboard/tasks", assign });
    const m = mockFetch({
      "GET /api/tasks": json({ message: "Unauthenticated" }, { status: 401 }),
      "POST /api/auth/logout": { ok: true },
    });
    await expect(http("/tasks")).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/login?next=%2Fdashboard%2Ftasks"));
    expect(m.calls.some((c) => c.path === "/api/auth/logout" && c.method === "POST")).toBe(true);
  });
});

describe("response helpers", () => {
  it("unwrap / listOf / metaOf handle Laravel resources and bare arrays", () => {
    expect(unwrap({ data: { a: 1 } })).toEqual({ a: 1 });
    expect(unwrap({ a: 1 })).toEqual({ a: 1 });
    expect(listOf({ data: [1, 2] })).toEqual([1, 2]);
    expect(listOf([3])).toEqual([3]);
    expect(listOf(null)).toEqual([]);
    expect(metaOf({ meta: { total: 5 } })).toEqual({ total: 5 });
    expect(metaOf({})).toEqual({});
  });
  it("toFieldErrors keeps the first message per field", () => {
    expect(toFieldErrors({ a: ["x", "y"], b: "z" })).toEqual({ a: "x", b: "z" });
    expect(toFieldErrors(null)).toEqual({});
  });
});
