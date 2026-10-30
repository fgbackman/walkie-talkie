import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type LimitResult =
  | { ok: true }
  | { ok: false; retryAfter: number; unavailable?: boolean };

/**
 * Fixed-window limiter backed by Postgres, so the limit is shared across
 * every serverless instance.
 *
 * On a database error it fails OPEN by default: a limiter outage should not
 * take walking and talking down, and RLS — not this — is the security
 * boundary. Pass `failClosed` for routes where unlimited attempts are the
 * risk (staff actions, minting media tokens, account deletion).
 */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
  opts: { failClosed?: boolean } = {},
): Promise<LimitResult> {
  const onError = (): LimitResult => {
    console.error("ratelimit: limiter unavailable", { bucket: bucket.split(":")[0] });
    return opts.failClosed ? { ok: false, retryAfter: 30, unavailable: true } : { ok: true };
  };

  try {
    const { data, error } = await supabaseAdmin().rpc("consume_rate_limit", {
      p_bucket: bucket,
      p_limit: limit,
      p_window_s: windowSeconds,
    });
    if (error) return onError();
    return data === false ? { ok: false, retryAfter: windowSeconds } : { ok: true };
  } catch {
    return onError();
  }
}

/**
 * Client IP for the per-IP limit.
 *
 * Only Netlify's own header is trusted: Netlify's edge sets it and overwrites
 * any client-supplied copy. X-Forwarded-For is not used, because its first
 * entry is whatever the client wrote, so rotating it would give an attacker
 * a fresh per-IP bucket on every request. Anywhere else (local dev, another
 * host) every caller shares one "unknown" bucket; the per-user limit still
 * applies. Behind a different trusted proxy, read that proxy's header here.
 */
export function clientIp(headers: Headers): string {
  return headers.get("x-nf-client-connection-ip")?.trim() || "unknown";
}
