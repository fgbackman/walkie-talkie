# Walkie Talkie

Drop-in audio rooms for people who are already walking. Live rooms (LiveKit),
GPS walk tracking, an interest feed, and a moderation console — on Next.js 15,
Supabase (Postgres + RLS), deployed to Netlify.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js 15 App Router, React 19, TypeScript | Server Components keep secrets server-side |
| Data | Supabase Postgres + Row Level Security | Authorisation lives in the database, not the UI |
| Auth | Supabase Auth — Google OAuth + TOTP 2FA | AAL2 enforced on admin and account routes |
| Voice | LiveKit Cloud | Tokens minted server-side, per-room grants, PTT |
| Hosting | Netlify (`@netlify/plugin-nextjs`) | |

## Security model in one paragraph

The browser only ever holds the **anon** key. Every table has RLS enabled and
`REVOKE ALL` as a baseline, so an anon key by itself reads nothing. Policies
grant exactly what a signed-in user should see. The **service role** key is
used in precisely three server routes (LiveKit token minting, admin actions,
the moderation queue) and never reaches a client bundle. Admin status is a
column on `profiles` checked by a `SECURITY DEFINER` function, verified
server-side on every admin request — the admin UI hiding itself is cosmetic,
not the control. Admin and account-settings routes additionally require
**AAL2** (a TOTP factor was used this session).

See [SECURITY.md](./SECURITY.md) for the full threat model and the checklist
run before each release.

## Local setup

```bash
npm install
cp .env.example .env.local        # fill in the values
npx supabase start                # local Postgres + Auth (needs Docker)
npx supabase db reset             # applies migrations + seed
npm run dev
```

Without Docker, point `.env.local` at a hosted Supabase project and run
`npx supabase db push` instead.

## Deploy

```bash
npm run build                     # must pass clean
netlify deploy --build --prod
```

Environment variables must be set in **Netlify → Site configuration →
Environment variables**, not in the repo. `SUPABASE_SERVICE_ROLE_KEY`,
`LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are server-only — do not add a
`NEXT_PUBLIC_` prefix to any of them.

## Google OAuth

1. Google Cloud Console → APIs & Services → OAuth consent screen (External).
2. Credentials → Create OAuth client ID → Web application.
3. Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Supabase → Authentication → Providers → Google → paste client ID + secret.
5. Supabase → Authentication → URL Configuration → add your Netlify URL to
   **Redirect URLs**.

## Layout

```
src/
  app/            routes — (app) for the product, admin for the console
  components/     UI
  lib/            supabase clients, livekit, geo maths, validation, rate limit
  types/          generated database types
supabase/
  migrations/     schema, RLS, functions, admin — applied in order
tests/            RLS tests that assert a plain user cannot read another's data
```
