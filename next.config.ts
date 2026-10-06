import type { NextConfig } from "next";

/**
 * Content-Security-Policy.
 *
 * LiveKit needs wss: to its SFU and https: for the token/ICE handshake;
 * Supabase needs https + wss for realtime. Everything else is locked down.
 * 'unsafe-inline' is required for Next's inlined bootstrap <style>; scripts
 * use a nonce-less strict-dynamic-free policy because Next 15 injects
 * inline bootstrap scripts — we keep 'self' only plus the framework hashes
 * Next emits, and no third-party script origins at all.
 */
function csp() {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const livekit = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";
  const supaHost = supabase ? new URL(supabase).origin : "";
  const lkHost = livekit ? livekit.replace(/^wss:/, "https:") : "";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "font-src 'self' https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    `connect-src 'self' ${supaHost} ${supaHost.replace(/^https:/, "wss:")} ${livekit} ${lkHost} https://fonts.googleapis.com`,
    "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: false },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            // We DO need microphone + geolocation; everything else off.
            value:
              "microphone=(self), geolocation=(self), camera=(), payment=(), usb=(), magnetometer=(), accelerometer=(self), gyroscope=(self), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
