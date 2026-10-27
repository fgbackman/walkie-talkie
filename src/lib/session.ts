/**
 * Session lifetime. Shared by middleware, the server client and the browser
 * client, so it must stay free of server-only imports.
 *
 * Supabase's access token lives an hour and refreshes itself; these limits
 * sit on top of that.
 */

/** Signed out after this long with no request at all. */
export const IDLE_TIMEOUT_S = 7 * 24 * 60 * 60;

/** Auth cookies expire after this, whatever the activity. */
export const SESSION_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

/** Staff must have entered a TOTP code within this window to act. */
export const STAFF_REVERIFY_S = 12 * 60 * 60;

/** Irreversible actions (deleting the account) need a sign-in this recent. */
export const RECENT_AUTH_S = 30 * 60;

/** Last-activity cookie written by middleware. HttpOnly; not readable by scripts. */
export const SEEN_COOKIE = "wt_seen";

/** Rewrite the activity cookie at most this often, not on every request. */
export const SEEN_REFRESH_S = 5 * 60;

/**
 * Options for the Supabase auth cookies. Not HttpOnly: the browser client
 * reads its session from them (room realtime, hand raising, MFA screens).
 */
export const authCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_COOKIE_MAX_AGE_S,
};

export function isIdle(lastSeenS: number | null, nowS: number): boolean {
  return lastSeenS !== null && nowS - lastSeenS > IDLE_TIMEOUT_S;
}

/** Newest timestamp (seconds) among the session's authentication methods. */
export function latestAuthAt(
  methods: ReadonlyArray<unknown> | undefined,
  only?: string,
): number | null {
  // supabase-js types this as AMREntry[] | string[]; only entries with a
  // timestamp can prove recency, so bare strings are ignored.
  const ts = (methods ?? [])
    .filter(
      (m): m is { method: string; timestamp: number } =>
        typeof m === "object" &&
        m !== null &&
        typeof (m as { timestamp?: unknown }).timestamp === "number",
    )
    .filter((m) => !only || m.method === only)
    .map((m) => m.timestamp);
  return ts.length ? Math.max(...ts) : null;
}
