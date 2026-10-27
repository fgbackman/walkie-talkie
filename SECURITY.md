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
| Account takeover | Google OAuth + TOTP; TOTP is **required** for moderators and admins (pages, admin API routes, and the database's `is_admin()`/`is_moderator()` all demand an `aal2` session); optional for everyone else; sessions rotate on sign-in |
| Privilege escalation to admin | `profiles.role`, bans and suspensions are guarded by the `guard_profile_privileges` trigger; `is_admin()`/`is_moderator()` answer only for the caller, only at `aal2`, are `SECURITY DEFINER` with a pinned `search_path`, and are not executable by `anon` |
| Taking the mic without permission | A participant can only change `hand_raised`, `is_walking` and leave; role, host mute and removal are host/staff-only (`guard_room_participant` trigger). New seats are always `listener` unless you host the room. LiveKit `canPublish` is minted from that row |
| Profile scraping | Other users' profiles expose only public columns (column grants); your own row comes from `get_my_profile()`; moderation fields from `staff_list_profiles()`. Handles are random, never derived from email |
| Forged or erased audit trail | Only the server writes `audit_log` (service role, actor id from the verified session); a statement-level trigger refuses UPDATE, DELETE and TRUNCATE for everyone |
| Reading another user's data via the anon key | RLS on every table, `REVOKE ALL` baseline, deny-by-default; `tests/rls.test.ts` asserts it |
| Service-role key leaking to the browser | Key read only inside `src/lib/supabase/admin.ts`, which throws if imported in a client bundle; CI greps the build output for the key prefix |
| Token forgery for a room | LiveKit tokens minted server-side only, scoped to one room, 2-hour TTL, `canPublish` decided by DB membership |
| Room flooding / scraping | Per-user + per-IP rate limits on every mutating route |
| XSS | React escaping, no `dangerouslySetInnerHTML` anywhere, and a per-request nonce CSP (`src/lib/csp.ts`, set in middleware): only scripts carrying the nonce run, so injected `<script>` tags and inline handlers are blocked. Styles still allow inline |
| Open redirect | Every `next=` goes through `safeNext()` (`src/lib/safe-redirect.ts`): same-site paths only |
| CSRF | Supabase cookies are `SameSite=Lax`; all mutations are POST/PATCH/DELETE through route handlers that verify the session server-side |
| Stolen or abandoned session | Signed out after 7 days without activity (middleware, HttpOnly `wt_seen` cookie); auth cookies capped at 30 days and `Secure` in production; staff re-enter a TOTP code every 12 hours; deleting the account needs a sign-in within 30 minutes |
| Location history held forever | Raw GPS points deleted 90 days after a walk (`prune_walk_points`, scheduled with pg_cron); summaries kept. Users can delete their account and everything in it from Settings, then Privacy |
| Recording without consent | `recording_enabled` can only be switched on by the host when `room_can_record()` is true; it switches itself off if a non-consenting speaker is promoted or a speaker withdraws consent (`guard_room`, `enforce_recording_consent`) |

## Pre-release checklist

```bash
npm run typecheck
npm run lint
npm run test            # unit tests (+ RLS assertions against a live project, if configured)
npm run test:db         # every migration on a scratch Postgres, then the authorisation tests
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

Reviewed 2026-10-27. `npm run audit` (production dependencies) reports clean
after moving to `next@15.5.28` (GHSA-2464-fhr4-w9xw) and `zod@4`
(GHSA-mrhx-c7xc-m3w5).

| Finding | Why it is accepted |
| --- | --- |
| `braces` / `micromatch` / `fast-glob` DoS, reached through `eslint-config-next` | Dev-only. These run at lint time against glob patterns that come from this repo's own config, never from user input. No patched release exists upstream as of this review; the only "fix" npm offers is downgrading `eslint-config-next` to 14.x, which would not match Next 15. Re-check each release. |

`postcss` and `sharp` were pulled forward with `overrides` in `package.json`
rather than waiting for Next to bump them — both are API-compatible patch
releases. Remove those overrides once Next ships them itself.

## Open items from the 2026-10-27 review

Not yet fixed; tracked here so they aren't forgotten.

- Supabase auth cookies are still not HttpOnly: the browser client reads
  them for realtime, hand-raising and the MFA screens. Making them HttpOnly
  means moving those calls behind route handlers.
- Supabase's own session time-box and inactivity timeout (Authentication ->
  Sessions) need a paid plan. The app enforces a 7-day idle sign-out itself
  in the meantime.
- The rate limiter still lets everyday routes through when its database
  errors. Staff actions, media tokens and account deletion now block instead.
- No SAST in CI for this private repo (CodeQL needs Advanced Security).
- Incident response: name a contact and write the containment and key
  rotation runbook.
- Backups: enable point-in-time recovery and test a restore.
