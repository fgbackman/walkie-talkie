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

/** Client IP, trusting only the first hop Netlify sets. */
export function clientIp(headers: Headers): string {
  const nf = headers.get("x-nf-client-connection-ip");
  if (nf) return nf;
  const xff = headers.get("x-forwarded-for");
  if (xff) return (xff.split(",")[0] ?? "").trim() || "unknown";
  return "unknown";
}
