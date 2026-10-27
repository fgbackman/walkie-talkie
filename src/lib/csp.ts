/**
 * Content-Security-Policy, built per request by middleware.
 *
 * Scripts run only if they carry this request's nonce ('strict-dynamic' then
 * trusts the chunks those scripts load), so an injected <script> or inline
 * handler does not execute. Next reads the nonce from the request's CSP
 * header and stamps it on its own bootstrap scripts.
 *
 * Styles keep 'unsafe-inline': React `style={}` attributes cannot carry a
 * nonce, and CSS injection is a much smaller risk than script injection.
 *
 * LiveKit needs wss: to its SFU and https: for the ICE handshake; Supabase
 * needs https + wss for realtime. No third-party script origins at all.
 */
export function buildCsp(nonce: string, opts: { dev?: boolean } = {}): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const livekit = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";
  const supaHost = supabase ? new URL(supabase).origin : "";
  const supaWs = supaHost.replace(/^https:/, "wss:");
  const lkHttps = livekit ? livekit.replace(/^wss:/, "https:") : "";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "font-src 'self' https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // React dev tooling evaluates code; production never gets 'unsafe-eval'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    ["connect-src 'self'", supaHost, supaWs, livekit, lkHttps].filter(Boolean).join(" "),
    opts.dev ? "" : "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");
}

/** 128 random bits, base64. Web Crypto, so it runs in the edge middleware. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
