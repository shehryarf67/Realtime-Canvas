import type { NextConfig } from "next";
import path from "node:path";

// Security headers applied to every response. No Content-Security-Policy here:
// a strict CSP needs per-request nonce plumbing for Next's inline scripts, so
// it's tracked as a follow-up rather than shipped half-configured.
const securityHeaders = [
  // Force HTTPS for two years (ignored by browsers over plain http, so safe in
  // local dev; honored on the Vercel https deployment).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Clickjacking: don't allow the app to be framed by anyone.
  { key: "X-Frame-Options", value: "DENY" },
  // Don't let browsers MIME-sniff responses into a different content type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send only the origin (not the full path) on cross-origin navigations.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Drop access to powerful features the app never uses.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
