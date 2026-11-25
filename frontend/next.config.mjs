/** @type {import('next').NextConfig} */
// Browser hardening headers on every response. CSP is deliberately not here: Next injects inline scripts, so a useful CSP
// needs per-request nonces (tracked as phase 2 in docs/AUDIT_REPORT.md).
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }, // ignored by browsers over plain http (local dev)
];

const nextConfig = {
  poweredByHeader: false,
  // Lets the E2E suite build/serve into its own folder without touching a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async redirects() {
    return [
      // "/under-review" was a duplicate of the waiting-approval screen.
      {
        source: "/under-review",
        destination: "/onboarding/waiting-approval",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
