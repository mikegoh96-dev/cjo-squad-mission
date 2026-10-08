import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

// Identifies this build. The app compares it with /api/version so a Home Screen
// app can update itself (it has no reload button and resumes old copies).
const appVersion =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? `local-${Date.now()}`;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { APP_VERSION: appVersion },
  typedRoutes: true,
  experimental: {
    // Reuse visited/prefetched pages for 30s so switching tabs is instant.
    // Saving a count purges this cache (revalidatePath in saveCaseCount).
    staleTimes: { dynamic: 30, static: 30 },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Push notification service worker: always fresh, same-origin only.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
