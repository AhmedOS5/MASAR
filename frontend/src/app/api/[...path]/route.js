import { NextResponse } from "next/server";
import { apiBase, configError, UPSTREAM_TIMEOUT_MS } from "@/lib/server/config";
import { forwardedFor } from "@/lib/server/client-ip";
import { crossSiteResponse, isSameSiteRequest } from "@/lib/server/csrf";
import { AUTH_COOKIE, STATUS_COOKIE, ONBOARDING, cookieOptions } from "@/lib/session";

// Generic same-origin proxy to the backend API: attaches the HttpOnly cookie as a
// Bearer token so the browser never sees or stores the token.

export const dynamic = "force-dynamic";

// Endpoints that must only be reachable through their dedicated route handlers
// (they return a token that would otherwise leak to client JS).
const BLOCKED_PATHS = new Set(["login", "auth/login"]);

const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "cache-control",
];

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// Segments may arrive raw or already decoded: check both forms so "%2F", "%2e%2e" and
// literal ".." / "/" can never escape the intended API path.
function validSegments(segments) {
  return (
    Array.isArray(segments) &&
    segments.length > 0 &&
    segments.every((s) => {
      if (!s) return false;
      return [s, safeDecode(s)].every(
        (v) => v !== "." && v !== ".." && !/[\\/]/.test(v) && !/^\.+$/.test(v),
      );
    })
  );
}

async function handle(request, { params }) {
  if (!isSameSiteRequest(request)) return crossSiteResponse();
  const base = apiBase();
  if (!base) return configError();

  const { path } = await params;
  if (!validSegments(path)) {
    return NextResponse.json({ message: "مسار غير صالح." }, { status: 400 });
  }
  const joined = path.join("/");
  if (BLOCKED_PATHS.has(joined)) {
    return NextResponse.json({ message: "غير موجود." }, { status: 404 });
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const headers = { Accept: "application/json", ...forwardedFor(request) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const method = request.method;
  let body;
  if (method !== "GET" && method !== "HEAD") {
    const buf = await request.arrayBuffer();
    if (buf.byteLength > 0) {
      body = buf;
      const ct = request.headers.get("content-type");
      if (ct) headers["Content-Type"] = ct; // keeps multipart boundary intact
    }
  }

  let upstream;
  try {
    upstream = await fetch(`${base}/${joined}${request.nextUrl.search}`, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json(
      { message: "تعذر الاتصال بالخادم، حاول لاحقاً." },
      { status: 502 },
    );
  }

  const outHeaders = new Headers();
  for (const h of FORWARD_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) outHeaders.set(h, v);
  }
  if (!outHeaders.has("cache-control")) outHeaders.set("cache-control", "no-store");

  const nullBody = upstream.status === 204 || upstream.status === 304;
  const response = new NextResponse(nullBody ? null : upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });

  if (upstream.status === 401 && token) {
    response.cookies.delete(AUTH_COOKIE);
    response.cookies.delete(STATUS_COOKIE);
  }

  // Successful onboarding submission => user now waits for admin approval.
  if (method === "POST" && joined === "organization/o" && upstream.ok) {
    response.cookies.set(
      STATUS_COOKIE,
      ONBOARDING.PENDING_APPROVAL,
      cookieOptions({ remember: true }),
    );
  }

  return response;
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
