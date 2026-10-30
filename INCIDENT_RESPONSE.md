# Incident response

What to do when something goes wrong: a leaked key, a compromised staff
account, data exposed by a bad policy, abuse in a live room. Written to be
followed under pressure: contain first, then investigate, then tell people.

> **Fill this in before launch.** An incident is a bad time to work out who
> is in charge.

| Role | Who | How to reach them |
| --- | --- | --- |
| Incident lead (decides, coordinates) | _name_ | _phone / Signal_ |
| Backup | _name_ | _phone / Signal_ |
| Privacy / legal contact (breach notifications) | _name_ | _email_ |

Access the lead needs: Supabase project owner, Netlify site owner, LiveKit
Cloud project admin, GitHub repo admin, Google Cloud project (OAuth client).

---

## 1. First 15 minutes

1. **Open an incident log.** A private doc with timestamps: what you saw,
   what you did, when. Everything below gets written there as you go.
2. **Decide the severity.**

   | Severity | Examples | Response |
   | --- | --- | --- |
   | **SEV1** | Service-role key or LiveKit secret leaked; GPS points or private data readable by others; admin account taken over | Contain now, whatever the hour |
   | **SEV2** | A moderator account misused; a vulnerability with no sign of use; harassment campaign across rooms | Contain today |
   | **SEV3** | Single abusive user; critical dependency advisory with no exposure | Normal working hours |

3. **Save the evidence before it expires.** Free-tier Supabase keeps logs
   for about a day. In Supabase → *Logs*, export the auth, API and Postgres
   logs for the window that matters, and export Netlify function logs. Then
   snapshot the audit trail:

   ```sql
   select * from public.audit_log
   where created_at > now() - interval '7 days'
   order by created_at desc;
   ```

4. **Contain** using the playbook below that matches.

---

## 2. Containment playbooks

### A. A server secret leaked (service-role key, LiveKit secret, JWT secret)

Treat a key pasted into a chat, a log, a screenshot, a public repo or a
client bundle as leaked. Rotating is cheap; guessing wrong is not.

1. **Supabase service-role key.** In the Supabase project's API key
   settings, rotate or revoke it. For the legacy `service_role` JWT, this
   means rotating the project's JWT secret or signing key, which also
   invalidates the anon key and **signs every user out**. That's accepted
   for a SEV1. Update `SUPABASE_SERVICE_ROLE_KEY` (and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` if it changed) in Netlify and redeploy.
2. **LiveKit API secret.** In LiveKit Cloud, go to *Settings* → *Keys*,
   create a new key, update `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` in
   Netlify, redeploy, then delete the old key. Tokens signed with the old
   key stop working when it's deleted.
3. **Google OAuth client secret.** Reset it in Google Cloud → *APIs &
   Services* → *Credentials*, then update it in Supabase → *Authentication*
   → *Providers* → *Google*.
4. Check `npm run secrets:scan` and the repo history for how it leaked, and
   close that path.

### B. A user or staff account is compromised

1. **End its sessions** (Supabase SQL editor). This revokes refresh tokens;
   access tokens already issued stay valid for up to an hour (`jwt_expiry`),
   or until the JWT key is rotated:

   ```sql
   delete from auth.sessions where user_id = '<user id>';
   ```

2. **Stop it acting.** For staff, demote them first. For anyone, ban them
   from the admin console (*Users* → *Ban*), or in SQL:

   ```sql
   update public.profiles set role = 'user', banned_at = now() where id = '<user id>';
   ```

   A banned profile is refused by every page and API route, and the
   database's `is_active()` check blocks its writes. Reads made directly
   with a still-valid token are only cut off when the token expires, which
   is why step 1 comes first.
3. **Remove their authenticator** if the attacker may have enrolled one:
   Supabase → *Authentication* → *Users* → the user → *MFA factors*.
4. Review what the account did:

   ```sql
   select * from public.audit_log where actor_id = '<user id>' order by created_at desc;
   ```

### C. Data exposed by a bug (RLS policy, grant, route)

1. **Stop the exposure first.** If a table is leaking, lock it while you fix
   the policy; the app degrades but stops leaking:

   ```sql
   revoke select on public.<table> from authenticated, anon;
   ```

   For a bad deploy, roll back: Netlify → *Deploys* → the last good deploy
   → *Publish deploy*, then lock it (*Stop auto publishing*) so the next
   push doesn't undo it.
2. Write the failing case into `supabase/tests/security_test.sql` before
   fixing it, so it can't come back.
3. Work out **whose data, which fields, and for how long**. You need this
   for section 3.

### D. Abuse in live rooms

1. Close the room: admin console → *Live rooms* → *Close room*. This
   disconnects everyone from LiveKit and writes an audit entry.
2. Suspend or ban the account (playbook B, step 2).
3. A coordinated attack (many new accounts): in Supabase → *Authentication*
   → *Providers*, switch off new sign-ups until it stops.

### E. A critical vulnerability in a dependency

1. `npm audit --omit=dev`, then read the advisory: does the vulnerable code
   path exist in this app?
2. Upgrade (Dependabot usually has the PR), run the full CI, deploy.
3. If you can't upgrade yet and the path is reachable, mitigate (disable the
   feature or route) and record why in `SECURITY.md` → *Accepted risks*.

---

## 3. Telling people

Personal data here includes **precise location history**, which regulators
treat as high risk. If personal data was, or may have been, accessed
without authorisation:

- **EU / UK users (GDPR).** Notify the supervisory authority within
  **72 hours** of becoming aware, unless the breach is unlikely to put
  anyone at risk. If it's likely to be *high* risk to people, which exposed
  location data usually is, tell the affected users directly and without
  undue delay.
- **US users.** State breach laws vary in scope and deadlines; check with
  the privacy contact.
- **Tell users plainly:** what happened, what data, what you've done, and
  what they should do (for example, sign out everywhere and set up two-step
  verification).

This is a summary, not legal advice. Get the privacy or legal contact
involved early on any SEV1 that touches user data.

---

## 4. Afterwards

Within a week:

- Write a short blameless review: timeline, cause, what contained it, and
  what would have caught it sooner.
- Turn each lesson into a change: a test in `supabase/tests/`, a CI check,
  a dashboard setting, or an update to this runbook.
- Turn Netlify auto publishing back on if you stopped it. Restore any grants you revoked
  in playbook C, once the fixed policy is tested.
- Confirm keys rotated in section 2 are the only ones in Netlify, and that
  the old ones are deleted, not just replaced.
