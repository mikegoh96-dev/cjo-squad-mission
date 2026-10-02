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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  experimental: {
    // Reuse visited/prefetched pages for 30s so switching tabs is instant.
    // Saving a count purges this cache (revalidatePath in saveCaseCount).
    staleTimes: { dynamic: 30, static: 30 },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The update screen: never indexed, never cached (it shows live counts
      // and a remembered member).
      {
        source: "/update",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
