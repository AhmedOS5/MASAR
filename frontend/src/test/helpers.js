// Small fetch-mocking helpers shared by tests.
import { vi } from "vitest";

export const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

function tryParse(body) {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

/** Install a fetch mock routed by "METHOD /path" => handler(req) | Response | object. */
export function mockFetch(routes) {
  const calls = [];
  const fn = vi.fn(async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = (init.method || "GET").toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    const record = { url, path, method, init, body: tryParse(init.body) };
    calls.push(record);
    const handler = routes[`${method} ${path}`] ?? routes[path];
    if (!handler) return json({ message: `no mock for ${method} ${path}` }, { status: 404 });
    const out = typeof handler === "function" ? await handler(record) : handler;
    // Response bodies are single-use: hand out a clone so a route can serve many calls.
    return out instanceof Response ? out.clone() : json(out);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls, last: () => calls[calls.length - 1] };
}
