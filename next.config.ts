import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Static security headers. The Content-Security-Policy with a per-request nonce is set in src/proxy.ts.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "@react-pdf/renderer", "pg-boss", "pino", "sharp"],
  experimental: {
    // Enables forbidden() and forbidden.tsx (PRD F01: 403 page).
    authInterrupts: true,
    serverActions: {
      // PRD F01: logo up to 2 MB, plus multipart overhead.
      bodySizeLimit: "3mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// next-intl without locale routing (ADR-028): the locale comes from src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
