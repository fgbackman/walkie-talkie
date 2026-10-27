/**
 * Where to send someone after sign-in or a second-factor check.
 *
 * `next` arrives in a query string, so anyone can craft it. Only a path on
 * this site is accepted; anything else — another origin, a protocol-relative
 * `//host`, a backslash trick like `/\host`, a `javascript:` URL — falls back
 * to the home page. Shared by the server callback and client components.
 */
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  // Control characters and backslashes are never part of a path we issue.
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;

  try {
    const base = "https://walkie.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
