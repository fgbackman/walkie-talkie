# Setup runbook

Everything below happens in a browser, in your own accounts. Do it in this
order — each step produces a value the next one needs.

Total: about 25 minutes. The free tier covers all four services.

---

## 0. Before you start

You need accounts on **Netlify**, **Supabase**, **LiveKit Cloud** and
**Google Cloud**. All four have free tiers that cover development.

Keep a scratch file open. You will collect seven values:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
NEXT_PUBLIC_SITE_URL=
```

**Never paste the last three or `SUPABASE_SERVICE_ROLE_KEY` into a chat, an
issue, or a screenshot.** They are server-only. If one leaks, rotate it in the
provider dashboard — do not just delete the message.

---

## 1. Netlify — create the site (3 min)

1. **https://app.netlify.com** → *Add new project* → *Import an existing project*
2. *Deploy with GitHub* → authorise Netlify if prompted. When GitHub asks which
   repositories, choose **Only select repositories** and pick
   `fgbackman/walkie-talkie`. Don't grant it your whole account.
3. Pick the `walkie-talkie` repo. Branch `main`.
4. Build settings are read from `netlify.toml` — build command `npm run build`,
   publish `.next`, the Next.js plugin. Leave them alone.
5. *Deploy*.

**This first build will fail.** That is expected: `src/lib/env.ts` validates
the environment at startup and there are no variables yet. It fails loudly on
purpose rather than shipping a half-configured app.

### Name the site

Netlify assigns a random subdomain (`glittering-marzipan-a1b2c3.netlify.app`).
To change it: *Project configuration* → *General* → *Change site name*.

`*.netlify.app` names are globally unique across every Netlify account, so the
obvious ones are long gone. The name field checks availability as you type —
that is the only reliable way to find a free one. Try adding a word that is
yours: an initial, a city, a year.

**Do this before step 3.** Once the URL is wired into Google and Supabase,
renaming means editing it in three places.

This site is named **`walkie-talkie-prod`**, so its URL is
`https://walkie-talkie-prod.netlify.app`. That goes in exactly three places:

| Where | Value |
| --- | --- |
| Netlify env vars | `NEXT_PUBLIC_SITE_URL=https://walkie-talkie-prod.netlify.app` |
| Supabase → Auth → URL Configuration → Site URL | `https://walkie-talkie-prod.netlify.app` |
| Supabase → Auth → URL Configuration → Redirect URLs | `https://walkie-talkie-prod.netlify.app/auth/callback` |

A custom domain later changes the same three values and nothing else.

---

## 2. Supabase — create the project (6 min)

1. **https://supabase.com/dashboard** → *New project*
2. Name `walkie-talkie`, pick the region closest to your users, generate a
   strong database password and save it in your password manager.
3. Wait for provisioning (~2 min).
4. *Project Settings* → *API keys* — copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (server-only, treat as a
     root password — it bypasses every Row Level Security policy)

### Apply the schema

*SQL Editor* → *New query* → paste the whole of
**`supabase/_all_migrations.sql`** → *Run*.

That is every migration concatenated in order (`npm run db:bundle`
regenerates it). It should finish with `Success. No rows returned`.

**Already deployed?** Don't paste the bundle again; it will fail partway
through. Paste only the migrations your project hasn't run yet, oldest
first, from `supabase/migrations/`. For projects set up before 2026-10-27,
that's `20261027000100_security_hardening.sql`. It replaces handles that were
derived from email addresses with random `walker-…` handles, and makes
staff powers require two-step verification. If you use the Supabase CLI,
`npm run db:push` applies only what's missing.

Then verify RLS is actually on:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Every row must show `rowsecurity = true`. If any says false, stop and fix it
before going further — that table is readable by anyone with the anon key.

### Make yourself an admin

```sql
insert into private.admin_bootstrap (email)
values ('fbackman@gmail.com')
on conflict (email) do nothing;
```

The first time that email signs in, the `handle_new_user` trigger promotes it
to admin, deletes the bootstrap row, and writes an audit entry. It is
one-shot: it cannot be replayed to re-promote a demoted account.

### Tighten auth settings

*Authentication* → *Sign In / Providers* → *Email*: confirm **Confirm email**
is on.
*Authentication* → *Attack Protection*: enable **Leaked password protection**.

---

## 3. Google OAuth (7 min)

1. **https://console.cloud.google.com** → create a project `walkie-talkie`.
2. *APIs & Services* → *OAuth consent screen*:
   - User type **External**
   - App name `Walkie Talkie`, your support email, your developer email
   - Scopes: the defaults (`email`, `profile`, `openid`) are enough — don't
     add more, every extra scope is another thing to justify at verification
   - While in *Testing*, add your own address under *Test users*
3. *APIs & Services* → *Credentials* → *Create credentials* → *OAuth client ID*
   - Type **Web application**, name `Walkie Talkie web`
   - **Authorised redirect URI** — exactly this, with your project ref:
     ```
     https://<project-ref>.supabase.co/auth/v1/callback
     ```
     The ref is the subdomain of your `NEXT_PUBLIC_SUPABASE_URL`. Note it is
     Supabase's callback, **not** your Netlify URL — Supabase brokers the
     exchange so the client secret never touches your app.
4. Copy the **Client ID** and **Client secret**.
5. Back in Supabase: *Authentication* → *Sign In / Providers* → *Google* →
   enable, paste both, *Save*.

---

## 4. LiveKit Cloud (3 min)

1. **https://cloud.livekit.io** → create a project `walkie-talkie`.
2. *Settings* → *Keys* → *Create key* (or use the default).
3. Copy:
   - **WebSocket URL** (`wss://…livekit.cloud`) → `NEXT_PUBLIC_LIVEKIT_URL`
   - **API Key** → `LIVEKIT_API_KEY`
   - **API Secret** → `LIVEKIT_API_SECRET` (shown once — save it now)

The free tier is 50 GB/month of bandwidth. Audio-only rooms are cheap: roughly
30 kbps per active speaker, not per listener, because listeners only receive.

---

## 5. Netlify — environment variables (3 min)

*Project configuration* → *Environment variables* → *Add a variable* →
*Import from a .env file* and paste all seven at once:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
NEXT_PUBLIC_LIVEKIT_URL=wss://<project>.livekit.cloud
LIVEKIT_API_KEY=<api key>
LIVEKIT_API_SECRET=<api secret>
NEXT_PUBLIC_SITE_URL=https://walkie-talkie-prod.netlify.app
```

Set the scope to **All deploy contexts**.

> Check the spelling of the three secrets. A `NEXT_PUBLIC_` prefix on
> `SUPABASE_SERVICE_ROLE_KEY` or `LIVEKIT_API_SECRET` inlines it into the
> JavaScript every visitor downloads. The repo's own `npm run secrets:scan`
> catches this in CI, but catch it here first.

---

## 6. Supabase — allow your site to redirect back (1 min)

*Authentication* → *URL Configuration*:

- **Site URL**: `https://walkie-talkie-prod.netlify.app`
- **Redirect URLs** — add both:
  ```
  https://walkie-talkie-prod.netlify.app/auth/callback
  http://localhost:3000/auth/callback
  ```

Without these, Google sign-in completes and then bounces to an error — the
single most common setup failure.

---

## 7. Deploy and verify

Netlify → *Deploys* → *Trigger deploy* → *Clear cache and deploy site*.

Then walk the app:

- [ ] `/login` renders, Google button appears
- [ ] Google sign-in lands you back on `/` as a signed-in user
- [ ] `/me` shows your handle; your role is admin (you seeded it in step 2)
- [ ] `/admin` first sends you to `/settings/security` to set up an
      authenticator. Staff accounts can't use the console without one. After
      enrolling, `/admin` asks for a code, then loads
- [ ] `/settings/security` → enrol an authenticator, then sign out and back in;
      you should be challenged for a code
- [ ] `/rooms/new` → open a channel → allow the microphone → hold the talk bar;
      a second browser signed in as another account should hear you
- [ ] `/walk` → *Start walk* → allow location → the route draws, splits land at
      each kilometre
- [ ] Finish the walk, then check in the Supabase table editor that
      `walks.distance_m` is non-zero and was computed server-side

### The check that matters most

Sign in as a second, ordinary account and run this in the browser console on
your deployed site:

```js
const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
const sb = createClient("<your supabase url>", "<your ANON key>");
await sb.auth.signInWithPassword({ email: "<second account>", password: "…" });
const { data } = await sb.from("walk_points").select("*").limit(5);
console.log(data); // must be []
```

If that returns anything other than an empty array, a Row Level Security
policy is wrong. Stop and fix it before you invite anyone.

---

## 8. After it works

- Rotate `SUPABASE_SERVICE_ROLE_KEY` and `LIVEKIT_API_SECRET` if either was
  ever pasted into a chat, a screenshot, or a terminal you don't control.
- Netlify → *Build & deploy* → *Deploy notifications* → fail notifications to
  your email.
- Supabase → *Database* → *Backups*: the free tier keeps 7 days. Upgrade
  before you have real users' data.
- Google OAuth consent screen stays in *Testing* (100 users cap) until you
  submit for verification. Do that before any public launch.
- Turn on branch deploys so pull requests get a preview URL. Add the preview
  domain to Supabase's redirect URLs if you want auth to work there.

---

## Local development

```bash
cp .env.example .env.local     # same seven values, with localhost as the site URL
npm install
npm run dev
```

Point `.env.local` at the same Supabase project, or run a local one with
`npx supabase start` (needs Docker) followed by `npx supabase db reset`.

To run the Row Level Security tests against a real database:

```bash
SUPABASE_TEST_URL=... SUPABASE_TEST_ANON_KEY=... SUPABASE_TEST_SERVICE_KEY=... \
  npm run test
```

Use a scratch project for that, not production — the tests create users.
