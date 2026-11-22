/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets the E2E suite build/serve into its own folder without touching a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
