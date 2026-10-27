-- ===========================================================================
-- Security hardening — 2026-10-27 review.
--
-- Closes the critical and high findings from that review:
--   1. Functions no longer executable by PUBLIC / anon.
--   2. Staff privileges in the database require an AAL2 (TOTP) session.
--   3. A participant cannot grant themselves the mic, the host seat, or
--      undo a host's mute or removal.
--   4. The audit log cannot be written through the API, and is append-only.
--   5. Recording consent is enforced in the database, not just described.
--   6. Handles are no longer derived from email addresses.
--   7. Other users' profiles expose only public columns.
-- ===========================================================================


-- --- 1. No PUBLIC execute on functions ------------------------------------
-- Postgres grants EXECUTE on every new function to PUBLIC. Revoking from
-- anon/authenticated (20261006000400) left that grant in place, so a
-- signed-out client could call any function in `public`.
-- Trigger functions do not need EXECUTE to fire, so this is safe for them.
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public;


-- --- 2. Staff privileges require a second factor --------------------------
-- These answer only for the caller (enumerating who is an admin is no
-- longer possible) and only when the session's JWT carries aal2. An admin
-- who signed in without their authenticator is an ordinary user to RLS.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid is not null
     and uid = auth.uid()
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from public.profiles p
       where p.id = uid and p.role = 'admin' and p.banned_at is null
     );
$$;

create or replace function public.is_moderator(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid is not null
     and uid = auth.uid()
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from public.profiles p
       where p.id = uid and p.role in ('admin', 'moderator') and p.banned_at is null
     );
$$;


-- --- 3. Room participants -------------------------------------------------
-- RLS lets a user insert and update their own seat, but cannot see which
-- columns changed. This trigger does: a participant may raise a hand, mark
-- themselves walking, or leave. Role, host mute and removal belong to the
-- room's host and to staff.
alter table public.room_participants
  add column if not exists removed_at timestamptz;

create or replace function public.guard_room_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  is_room_host boolean;
begin
  -- Service role and internal maintenance act without a user.
  if uid is null then
    return new;
  end if;

  select exists (
    select 1 from public.rooms r
    where r.id = new.room_id and r.host_id = uid
  ) into is_room_host;

  if tg_op = 'INSERT' then
    -- Everyone enters as a listener; only the room's host takes the host
    -- seat, and only for themselves.
    if not (new.role = 'host' and new.user_id = uid and is_room_host) then
      new.role := 'listener';
    end if;
    new.muted_by_host := false;
    new.removed_at := null;
    new.left_at := null;
    return new;
  end if;

  -- UPDATE (including the DO UPDATE half of an upsert).
  if is_room_host or public.is_moderator(uid) then
    return new;
  end if;

  if new.role          is distinct from old.role
     or new.muted_by_host is distinct from old.muted_by_host
     or new.removed_at  is distinct from old.removed_at
     or new.room_id     is distinct from old.room_id
     or new.user_id     is distinct from old.user_id
     or new.joined_at   is distinct from old.joined_at
  then
    raise exception 'only the host can change that'
      using errcode = '42501';
  end if;

  if old.removed_at is not null and new.left_at is null then
    raise exception 'you were removed from this room'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists room_participants_guard on public.room_participants;
create trigger room_participants_guard
  before insert or update on public.room_participants
  for each row execute function public.guard_room_participant();


-- --- 4. Audit log ---------------------------------------------------------
-- log_audit() let any signed-in user write arbitrary entries. The server now
-- writes audit rows with the service role, using an actor id it verified.
drop function if exists public.log_audit(text, text, uuid, jsonb);

create or replace function public.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;

-- Statement-level so it also refuses TRUNCATE, which row triggers never see.
drop trigger if exists audit_log_append_only on public.audit_log;
create trigger audit_log_append_only
  before delete or truncate on public.audit_log
  for each statement execute function public.audit_log_append_only();

-- Rows are never rewritten, with one exception: when an account is deleted,
-- the foreign key's ON DELETE SET NULL clears actor_id. Refusing that would
-- make every user who ever appeared in the log undeletable.
create or replace function public.audit_log_no_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.actor_id is null
     and old.actor_id is not null
     and (new.id, new.action, new.target_type, new.target_id, new.metadata, new.created_at)
         is not distinct from
         (old.id, old.action, old.target_type, old.target_id, old.metadata, old.created_at)
  then
    return new;
  end if;
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists audit_log_no_rewrite on public.audit_log;
create trigger audit_log_no_rewrite
  before update on public.audit_log
  for each row execute function public.audit_log_no_rewrite();


-- --- 5. Rooms: protected columns and recording consent --------------------
-- A host may edit their room's title, description, topics and pace, and end
-- it. They may not reassign it, fake its counters, reopen a room staff
-- closed, or switch recording on without every publisher's consent.
create or replace function public.guard_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  staff boolean;
begin
  -- Service role, and updates issued by our own triggers (counters,
  -- consent enforcement), pass.
  if uid is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.recording_enabled := false;
    new.listener_count := 0;
    new.walking_count := 0;
    new.ended_at := null;
    new.closed_by := null;
    new.close_reason := null;
    return new;
  end if;

  staff := public.is_moderator(uid);

  if new.host_id is distinct from old.host_id
     or new.livekit_room is distinct from old.livekit_room
     or new.listener_count is distinct from old.listener_count
     or new.walking_count is distinct from old.walking_count
     or new.created_at is distinct from old.created_at
     or new.started_at is distinct from old.started_at
  then
    raise exception 'that column is not editable' using errcode = '42501';
  end if;

  if not staff and (new.closed_by is distinct from old.closed_by
                    or new.close_reason is distinct from old.close_reason) then
    raise exception 'only staff can close a room' using errcode = '42501';
  end if;

  if old.closed_by is not null and new.is_live and not old.is_live and not staff then
    raise exception 'this room was closed by a moderator' using errcode = '42501';
  end if;

  if new.recording_enabled and not old.recording_enabled then
    if new.host_id <> uid then
      raise exception 'only the host can start recording' using errcode = '42501';
    end if;
    if not public.room_can_record(new.id) then
      raise exception 'every speaker must consent to recording' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists rooms_guard on public.rooms;
create trigger rooms_guard
  before insert or update on public.rooms
  for each row execute function public.guard_room();

-- Consent can be lost after recording starts: a non-consenting speaker is
-- promoted, or a speaker withdraws consent. Either switches recording off.
create or replace function public.enforce_recording_consent(rid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.rooms r
  set recording_enabled = false
  where r.id = rid
    and r.recording_enabled
    and not public.room_can_record(rid);
$$;

create or replace function public.on_participant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid := coalesce(new.room_id, old.room_id);
begin
  perform public.refresh_room_counts(rid);
  perform public.enforce_recording_consent(rid);
  return coalesce(new, old);
end;
$$;

create or replace function public.on_consent_withdrawn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
begin
  for rid in
    select rp.room_id from public.room_participants rp
    where rp.user_id = new.id
      and rp.left_at is null
      and rp.role in ('host', 'cohost', 'speaker')
  loop
    perform public.enforce_recording_consent(rid);
  end loop;
  return new;
end;
$$;

drop trigger if exists profiles_consent_withdrawn on public.profiles;
create trigger profiles_consent_withdrawn
  after update of consent_recording on public.profiles
  for each row
  when (old.consent_recording and not new.consent_recording)
  execute function public.on_consent_withdrawn();


-- --- 6. Handles are not derived from email --------------------------------
-- The old trigger used the email's local part ("jane.doe.1985"), and every
-- signed-in user can read every handle. New accounts get a random handle;
-- existing email-derived handles are replaced.
create or replace function public.random_handle()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  h text;
begin
  loop
    h := 'walker-' || encode(extensions.gen_random_bytes(5), 'hex');
    exit when not exists (select 1 from public.profiles p where lower(p.handle) = h);
  end loop;
  return h;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  final_handle text := public.random_handle();
  promote boolean := false;
begin
  select true into promote
  from private.admin_bootstrap b
  where lower(b.email) = lower(coalesce(new.email, ''))
  limit 1;

  insert into public.profiles (id, handle, display_name, avatar_url, role)
  values (
    new.id,
    final_handle,
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name',
             'Walker'),
    new.raw_user_meta_data ->> 'avatar_url',
    case when coalesce(promote, false) then 'admin'::public.user_role
         else 'user'::public.user_role end
  );

  if coalesce(promote, false) then
    delete from private.admin_bootstrap b where lower(b.email) = lower(new.email);
    -- No email in the audit row: the user id identifies the account.
    insert into public.audit_log (actor_id, action, target_type, target_id)
    values (new.id, 'admin.bootstrap', 'user', new.id);
  end if;

  return new;
end;
$$;

-- Same derivation the old trigger used, so we only touch handles it made.
with derived as (
  select p.id,
         lower(p.handle) as handle,
         left(lower(regexp_replace(split_part(u.email, '@', 1), '[^a-z0-9._-]', '', 'g')), 24) as base
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email is not null
)
update public.profiles p
set handle = public.random_handle(),
    display_name = case when p.display_name = p.handle then 'Walker' else p.display_name end
from derived d
where d.id = p.id
  and char_length(d.base) >= 3
  and (d.handle = d.base
       or (left(d.handle, char_length(d.base)) = d.base
           and substr(d.handle, char_length(d.base) + 1) ~ '^([0-9]+|[0-9a-f]{6})$'));


-- --- 7. Profiles: public columns only --------------------------------------
-- Every signed-in user could `select *` on every profile — privacy
-- settings, suspension state, role. Column grants now limit what another
-- user can read; your own full row comes from get_my_profile(), and staff
-- read moderation fields through staff_list_profiles().
revoke select, update on public.profiles from authenticated;

grant select (id, handle, callsign, display_name, avatar_url, bio, interests, created_at)
  on public.profiles to authenticated;

-- Role / ban / suspension stay updatable at the grant level so admins can
-- act; guard_profile_privileges() is what stops everyone else.
grant update (display_name, bio, interests, share_live_location, fuzz_endpoints,
              consent_recording, weekly_goal_m, role, banned_at, suspended_until)
  on public.profiles to authenticated;

create or replace function public.get_my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.staff_list_profiles(p_query text default null)
returns table (
  id uuid,
  handle text,
  display_name text,
  avatar_url text,
  role public.user_role,
  banned_at timestamptz,
  suspended_until timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.handle, p.display_name, p.avatar_url, p.role,
         p.banned_at, p.suspended_until, p.created_at
  from public.profiles p
  where public.is_moderator(auth.uid())
    and (p_query is null
         or p.handle ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by p.created_at desc
  limit 100;
$$;


-- --- grants for the functions above ---------------------------------------
revoke execute on all functions in schema public from public, anon;

grant execute on function public.get_my_profile()            to authenticated;
grant execute on function public.staff_list_profiles(text)   to authenticated;
-- Already granted, restated so this file reads as the full list:
grant execute on function public.is_admin(uuid)              to authenticated;
grant execute on function public.is_moderator(uuid)          to authenticated;
grant execute on function public.is_active(uuid)             to authenticated;
grant execute on function public.in_room(uuid, uuid)         to authenticated;
grant execute on function public.follows_user(uuid, uuid)    to authenticated;
grant execute on function public.room_can_record(uuid)       to authenticated;
grant execute on function public.finalize_walk(uuid)         to authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
