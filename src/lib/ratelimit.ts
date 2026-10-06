import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type LimitResult = { ok: true } | { ok: false; retryAfter: number };

/**
 * Fixed-window limiter backed by Postgres, so the limit is shared across
 * every serverless instance. Fails OPEN on a database error: a limiter
 * outage should not take the product down, and the RLS policies — not this —
 * are the real security boundary.
 */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<LimitResult> {
  try {
    const { data, error } = await supabaseAdmin().rpc("consume_rate_limit", {
      p_bucket: bucket,
      p_limit: limit,
      p_window_s: windowSeconds,
    });
    if (error) return { ok: true };
    return data === false ? { ok: false, retryAfter: windowSeconds } : { ok: true };
  } catch {
    return { ok: true };
  }
}

/** Client IP, trusting only the first hop Netlify sets. */
export function clientIp(headers: Headers): string {
  const nf = headers.get("x-nf-client-connection-ip");
  if (nf) return nf;
  const xff = headers.get("x-forwarded-for");
  if (xff) return (xff.split(",")[0] ?? "").trim() || "unknown";
  return "unknown";
}
