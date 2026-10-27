-- ===========================================================================
-- Authorisation tests, run by scripts/db-test.sh after every migration.
--
-- Each block acts as a real API caller would: `set role authenticated` plus
-- the JWT claims PostgREST would set. Any failed expectation raises, and
-- psql's ON_ERROR_STOP turns that into a non-zero exit.
-- ===========================================================================

\set ON_ERROR_STOP 1
-- Only NOTICE lines (ok - ...) and errors are interesting.
\o /dev/null

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Run `q`; it must fail with SQLSTATE `code`.
create function tests.throws(q text, label text, code text default '42501') returns void
language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlstate = code then
      raise notice 'ok - % (%)', label, sqlerrm;
      return;
    end if;
    raise exception 'FAILED: % — expected SQLSTATE % but got % (%)', label, code, sqlstate, sqlerrm;
  end;
  raise exception 'FAILED: % — expected SQLSTATE % but the statement succeeded', label, code;
end;
$$;

create function tests.ok(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FAILED: %', label;
  end if;
  raise notice 'ok - %', label;
end;
$$;

-- Act as a signed-in user until the next call.
create function tests.login(uid uuid, aal text default 'aal1') returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, false);
$$;

create function tests.logout() returns void
language sql as $$ select set_config('request.jwt.claims', '', false); $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Read state as the platform, bypassing RLS and column grants.
create function tests.participant(rid uuid, uid uuid) returns public.room_participants
language sql security definer as $$
  select * from public.room_participants where room_id = rid and user_id = uid;
$$;
create function tests.room(rid uuid) returns public.rooms
language sql security definer as $$ select * from public.rooms where id = rid; $$;
create function tests.profile(uid uuid) returns public.profiles
language sql security definer as $$ select * from public.profiles where id = uid; $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- --- fixtures (as the platform, no user) ---------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000a11c', 'alice.smith@example.com', '{"full_name":"Alice Smith"}'),
  ('00000000-0000-4000-8000-000000000b0b', 'bob@example.com',          '{"full_name":"Bob"}'),
  ('00000000-0000-4000-8000-0000000bad00', 'mallory@example.com',      '{"full_name":"Mallory"}'),
  ('00000000-0000-4000-8000-00000000d0d0', 'mod@example.com',          '{"full_name":"Mod"}'),
  ('00000000-0000-4000-8000-00000000ad00', 'admin@example.com',        '{"full_name":"Admin"}');

update public.profiles set role = 'moderator' where id = '00000000-0000-4000-8000-00000000d0d0';
update public.profiles set role = 'admin'     where id = '00000000-0000-4000-8000-00000000ad00';

\set alice   '''00000000-0000-4000-8000-00000000a11c'''
\set bob     '''00000000-0000-4000-8000-000000000b0b'''
\set mallory '''00000000-0000-4000-8000-0000000bad00'''
\set mod     '''00000000-0000-4000-8000-00000000d0d0'''
\set admin   '''00000000-0000-4000-8000-00000000ad00'''
\set room    '''00000000-0000-4000-8000-0000000000a1'''

-- ===========================================================================
-- Handles are not derived from email
-- ===========================================================================
select tests.ok(
  not exists (select 1 from public.profiles
              where handle in ('alice.smith', 'bob', 'mallory', 'mod', 'admin')),
  'new accounts do not get an email-derived handle');

select tests.ok(
  (tests.profile('0000000a-0000-4000-8000-000000000001')).handle like 'walker-%'
  and (tests.profile('0000000a-0000-4000-8000-000000000001')).display_name = 'Walker',
  'legacy email-derived handle and display name were replaced');

select tests.ok(
  (tests.profile('0000000a-0000-4000-8000-000000000002')).handle like 'walker-%'
  and (tests.profile('0000000a-0000-4000-8000-000000000002')).display_name = 'Sam Rivers',
  'legacy email-derived handle replaced, chosen display name kept');

-- ===========================================================================
-- Rooms: protected columns
-- ===========================================================================
set role authenticated;
select tests.login(:alice);

insert into public.rooms (id, title, host_id, livekit_room, recording_enabled, listener_count)
values (:room, 'Morning loop', :alice, 'wt_test', true, 999);

select tests.ok(
  not (tests.room(:room)).recording_enabled and (tests.room(:room)).listener_count = 0,
  'a new room cannot start recording or with faked counters');

select tests.throws(
  format('update public.rooms set listener_count = 999 where id = %L', :room),
  'host cannot fake the listener count');
select tests.throws(
  format('update public.rooms set host_id = %L where id = %L', :mallory, :room),
  'host cannot hand the room to someone else');

-- ===========================================================================
-- Participants: nobody grants themselves the mic
-- ===========================================================================
insert into public.room_participants (room_id, user_id, role) values (:room, :alice, 'host');
select tests.ok((tests.participant(:room, :alice)).role = 'host',
  'the room host takes the host seat');

select tests.login(:mallory);
insert into public.room_participants (room_id, user_id, role, muted_by_host)
values (:room, :mallory, 'host', false);
select tests.ok((tests.participant(:room, :mallory)).role = 'listener',
  'joining as "host" in someone else''s room lands as a listener');

select tests.throws(
  format('update public.room_participants set role = %L where room_id = %L and user_id = %L',
         'speaker', :room, :mallory),
  'a listener cannot promote themselves to speaker');

update public.room_participants set hand_raised = true
where room_id = :room and user_id = :mallory;
select tests.ok((tests.participant(:room, :mallory)).hand_raised,
  'a listener can still raise their hand');

-- The host mutes, then removes Mallory.
select tests.login(:alice);
update public.room_participants set role = 'speaker', muted_by_host = true
where room_id = :room and user_id = :mallory;

select tests.login(:mallory);
select tests.throws(
  format('update public.room_participants set muted_by_host = false where room_id = %L and user_id = %L',
         :room, :mallory),
  'a muted speaker cannot unmute themselves');

select tests.login(:alice);
update public.room_participants set left_at = now(), removed_at = now()
where room_id = :room and user_id = :mallory;

select tests.login(:mallory);
select tests.throws(
  format('update public.room_participants set left_at = null where room_id = %L and user_id = %L',
         :room, :mallory),
  'a removed participant cannot clear their own removal');
select tests.throws(
  format($q$insert into public.room_participants (room_id, user_id, left_at) values (%L, %L, null)
            on conflict (room_id, user_id) do update set left_at = excluded.left_at$q$,
         :room, :mallory),
  'a removed participant cannot rejoin through the join upsert');

-- An ordinary leave-and-rejoin still works, and keeps the seat's role.
select tests.login(:bob);
insert into public.room_participants (room_id, user_id) values (:room, :bob);
update public.room_participants set left_at = now() where room_id = :room and user_id = :bob;
insert into public.room_participants (room_id, user_id, left_at) values (:room, :bob, null)
on conflict (room_id, user_id) do update set left_at = excluded.left_at;
select tests.ok((tests.participant(:room, :bob)).left_at is null
                and (tests.participant(:room, :bob)).role = 'listener',
  'a participant who left on their own can rejoin');

-- ===========================================================================
-- Recording consent is enforced
-- ===========================================================================
select tests.login(:alice);
select tests.throws(
  format('update public.rooms set recording_enabled = true where id = %L', :room),
  'recording cannot start while the host has not consented');

update public.profiles set consent_recording = true where id = :alice;
update public.rooms set recording_enabled = true where id = :room;
select tests.ok((tests.room(:room)).recording_enabled,
  'recording starts once every publisher consents');

-- Mallory (a non-consenting speaker, though removed) does not count: she left.
-- Promoting Bob, who has not consented, stops the recording.
update public.room_participants set role = 'speaker' where room_id = :room and user_id = :bob;
select tests.ok(not (tests.room(:room)).recording_enabled,
  'promoting a non-consenting speaker switches recording off');

select tests.login(:bob);
update public.profiles set consent_recording = true where id = :bob;
select tests.login(:alice);
update public.rooms set recording_enabled = true where id = :room;
select tests.login(:bob);
update public.profiles set consent_recording = false where id = :bob;
select tests.ok(not (tests.room(:room)).recording_enabled,
  'a speaker withdrawing consent switches recording off');

-- ===========================================================================
-- Staff powers need a second factor
-- ===========================================================================
select tests.login(:mod, 'aal1');
select tests.ok(not public.is_moderator(), 'a moderator without TOTP is not a moderator to RLS');
update public.rooms set is_live = false, closed_by = :mod where id = :room;
select tests.ok((tests.room(:room)).is_live, 'a moderator at aal1 cannot close a room');

select tests.login(:mod, 'aal2');
select tests.ok(public.is_moderator(), 'a moderator with TOTP is a moderator');
update public.rooms set is_live = false, ended_at = now(), closed_by = :mod, close_reason = 'test'
where id = :room;
select tests.ok(not (tests.room(:room)).is_live, 'a moderator at aal2 can close a room');

select tests.login(:alice);
select tests.throws(
  format('update public.rooms set is_live = true where id = %L', :room),
  'a host cannot reopen a room staff closed');

select tests.login(:admin, 'aal1');
update public.profiles set banned_at = now() where id = :mallory;
select tests.ok((tests.profile(:mallory)).banned_at is null,
  'an admin without TOTP cannot ban');

select tests.login(:admin, 'aal2');
update public.profiles set suspended_until = now() + interval '1 day' where id = :mallory;
select tests.ok((tests.profile(:mallory)).suspended_until is not null,
  'an admin with TOTP can suspend');

select tests.login(:mallory);
select tests.ok(not public.is_admin(:admin::uuid),
  'is_admin() cannot be used to find out who the admins are');
select tests.throws(
  format('update public.profiles set role = %L where id = %L', 'admin', :mallory),
  'a user cannot promote themselves');

-- ===========================================================================
-- Profiles expose public columns only
-- ===========================================================================
select tests.ok((select count(*) from public.profiles) >= 5,
  'public profile columns are readable');
select tests.throws(
  'select share_live_location from public.profiles',
  'other users'' privacy settings are not readable');
select tests.throws(
  'select * from public.profiles',
  'select * on profiles is refused');
select tests.ok((select handle from public.get_my_profile()) is not null
                and (select consent_recording from public.get_my_profile()) is not null,
  'a user reads their own full profile through get_my_profile()');
select tests.ok((select count(*) from public.staff_list_profiles()) = 0,
  'staff_list_profiles() returns nothing to a non-moderator');

select tests.login(:mod, 'aal2');
select tests.ok((select count(*) from public.staff_list_profiles()) >= 5,
  'staff_list_profiles() works for a moderator with TOTP');
select tests.ok((select count(*) from public.staff_list_profiles('%')) = 0,
  'staff_list_profiles() treats % in the search as a literal');

-- ===========================================================================
-- Audit log
-- ===========================================================================
select tests.login(:mallory);
select tests.throws(
  $q$select public.log_audit('admin.ban', 'user', null, '{}'::jsonb)$q$,
  'log_audit() is gone', '42883');
select tests.throws(
  $q$insert into public.audit_log (action) values ('admin.ban')$q$,
  'users cannot insert audit rows directly');

reset role;
select tests.logout();
set role service_role;
insert into public.audit_log (action) values ('test.entry');
select tests.ok((select count(*) from public.audit_log where action = 'test.entry') = 1,
  'the server (service role) can append audit rows');
reset role;
select tests.throws('delete from public.audit_log', 'even the platform cannot delete audit rows');
select tests.throws('truncate public.audit_log', 'or truncate them');
select tests.throws($q$update public.audit_log set action = 'x'$q$, 'or rewrite them');
select tests.throws($q$update public.audit_log set actor_id = null, action = 'x'$q$,
  'or rewrite them while clearing the actor');

-- Deleting an account clears its actor id instead of failing.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000de1e7', 'gone@example.com');
insert into public.audit_log (actor_id, action) values ('00000000-0000-4000-8000-0000000de1e7', 'room.create');
delete from auth.users where id = '00000000-0000-4000-8000-0000000de1e7';
select tests.ok(
  exists (select 1 from public.audit_log where action = 'room.create' and actor_id is null),
  'deleting an account keeps its audit rows and clears the actor');

-- ===========================================================================
-- Function execution
-- ===========================================================================
set role anon;
select tests.throws('select public.is_admin()', 'anon cannot execute functions');

set role authenticated;
select tests.login(:mallory);
select tests.throws(format('select public.refresh_room_counts(%L)', :room),
  'internal helpers are not callable through the API');
select tests.throws($q$select public.consume_rate_limit('x', 1, 1)$q$,
  'the rate limiter is service-role only');

-- ===========================================================================
-- Location history stays private (regression for the original guarantees)
-- ===========================================================================
select tests.login(:alice);
insert into public.walks (id, user_id, visibility)
values ('00000000-0000-4000-8000-0000000000b1', :alice, 'private');
insert into public.walk_points (walk_id, t, lat, lng)
values ('00000000-0000-4000-8000-0000000000b1', now(), 37.8, -122.4);

select tests.login(:mallory);
select tests.ok((select count(*) from public.walk_points) = 0,
  'another user cannot read someone''s GPS points');
select tests.ok((select count(*) from public.walks
                 where id = '00000000-0000-4000-8000-0000000000b1') = 0,
  'another user cannot read a private walk');

reset role;
\o
\echo 'all security tests passed'
