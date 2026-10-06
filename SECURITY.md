# Security

## Reporting

Email the address in the repo owner's profile. Please don't open a public
issue for anything exploitable.

## Threat model

This app handles two unusually sensitive things: **live microphone audio** and
**precise location history**. The design assumes a motivated stranger is in
the room with you.

| Threat | Control |
| --- | --- |
| Stranger locates a user's home | Start/end points fuzzed by default (`profiles.fuzz_endpoints`); live position never exposed outside a squad; `walk_points` readable only by the owner |
| Account takeover | Google OAuth + optional TOTP; AAL2 required for admin + account settings; sessions rotate on sign-in |
| Privilege escalation to admin | `profiles.role` is not user-writable (RLS `WITH CHECK` blocks role changes); `is_admin()` is `SECURITY DEFINER` with a pinned `search_path` |
| Reading another user's data via the anon key | RLS on every table, `REVOKE ALL` baseline, deny-by-default; `tests/rls.test.ts` asserts it |
| Service-role key leaking to the browser | Key read only inside `src/lib/supabase/admin.ts`, which throws if imported in a client bundle; CI greps the build output for the key prefix |
| Token forgery for a room | LiveKit tokens minted server-side only, scoped to one room, 2-hour TTL, `canPublish` decided by DB membership |
| Room flooding / scraping | Per-user + per-IP rate limits on every mutating route |
| XSS | React escaping, strict CSP with no third-party script origins, no `dangerouslySetInnerHTML` anywhere |
| CSRF | Supabase cookies are `SameSite=Lax`; all mutations are POST through route handlers that verify the session server-side |
| Recording without consent | Rooms are not recordable unless every publisher has `consent_recording = true`; enforced in `rooms_can_record()` |

## Pre-release checklist

```bash
npm run typecheck
npm run lint
npm run test            # includes RLS assertions
npm run audit           # npm audit, high and above
npm run secrets:scan    # service-role key must not appear in .next/static
```

Plus, manually:

- [ ] Supabase → Auth → confirm "Confirm email" is on for the email provider
- [ ] Supabase → Auth → leaked-password protection enabled
- [ ] Supabase → Database → confirm RLS is on for every table in `public`
- [ ] Netlify → env vars contain no `NEXT_PUBLIC_` copy of a secret
- [ ] Rotate `LIVEKIT_API_SECRET` and the service-role key if either was ever
      pasted into a chat, a log, or a screenshot

## Accepted risks

Reviewed 2026-10-06. `npm run audit` (production dependencies) reports clean.

| Finding | Why it is accepted |
| --- | --- |
| `braces` / `micromatch` / `fast-glob` DoS, reached through `eslint-config-next` | Dev-only. These run at lint time against glob patterns that come from this repo's own config, never from user input. No patched release exists upstream as of this review; the only "fix" npm offers is downgrading `eslint-config-next` to 14.x, which would not match Next 15. Re-check each release. |

`postcss` and `sharp` were pulled forward with `overrides` in `package.json`
rather than waiting for Next to bump them — both are API-compatible patch
releases. Remove those overrides once Next ships them itself.
