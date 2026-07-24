import type { NextConfig } from "next";
import path from "node:path";

// These headers apply to every page. CSP is left out until Next inline scripts
// can use proper per-request nonces.
const securityHeaders = [
  // Browsers only apply HSTS over HTTPS, so localhost is unaffected.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Do not allow the app inside another site's frame.
  { key: "X-Frame-Options", value: "DENY" },
  // Use the declared response content type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Do not leak full page paths to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app does not need these browser features.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// When set (production/Vercel), the API is proxied under this origin's /api/*
// path so the auth cookie is first-party — third-party cookies are blocked by
// Safari and being phased out by Chrome. Local dev leaves this unset and talks
// to the API directly.
const apiProxyTarget = process.env.API_PROXY_TARGET;

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
  async rewrites() {
    if (!apiProxyTarget) return [];
    const target = apiProxyTarget.replace(/\/$/, "");
    // Covers REST (/api/auth, /api/boards, …) and Socket.IO (/api/socket.io/*).
    return [{ source: "/api/:path*", destination: `${target}/:path*` }];
  },
};

export default nextConfig;
