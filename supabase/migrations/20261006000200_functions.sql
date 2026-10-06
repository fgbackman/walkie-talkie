-- ===========================================================================
-- Functions and triggers.
--
-- Every SECURITY DEFINER function pins `search_path` to an empty string and
-- fully qualifies its object names. Without that, a caller can create a
-- shadowing object in a schema they control and have it run with the
-- definer's privileges — the classic Postgres privilege-escalation bug.
-- ===========================================================================

-- --- role checks ----------------------------------------------------------
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
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
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role in ('admin', 'moderator') and p.banned_at is null
  );
$$;

create or replace function public.is_active(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.banned_at is null
      and (p.suspended_until is null or p.suspended_until < now())
  );
$$;

-- Is `viewer` allowed to see `owner`'s followers-only content?
create or replace function public.follows_user(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.follows f
    where f.follower_id = viewer and f.followee_id = owner
  );
$$;

create or replace function public.in_room(rid uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_participants rp
    where rp.room_id = rid and rp.user_id = uid and rp.left_at is null
  );
$$;

-- --- new user -> profile --------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_handle text;
  final_handle text;
  n int := 0;
  promote boolean := false;
begin
  base_handle := lower(regexp_replace(split_part(coalesce(new.email, 'walker'), '@', 1),
                                      '[^a-z0-9._-]', '', 'g'));
  if char_length(base_handle) < 3 then
    base_handle := 'walker';
  end if;
  base_handle := left(base_handle, 24);

  final_handle := base_handle;
  while exists (select 1 from public.profiles p where lower(p.handle) = final_handle) loop
    n := n + 1;
    final_handle := base_handle || n::text;
    if n > 500 then
      final_handle := base_handle || substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6);
      exit;
    end if;
  end loop;

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
             final_handle),
    new.raw_user_meta_data ->> 'avatar_url',
    case when coalesce(promote, false) then 'admin'::public.user_role
         else 'user'::public.user_role end
  );

  if coalesce(promote, false) then
    delete from private.admin_bootstrap b where lower(b.email) = lower(new.email);
    insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
    values (new.id, 'admin.bootstrap', 'user', new.id,
            jsonb_build_object('email', new.email));
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- privilege-escalation guard ------------------------------------------
-- RLS WITH CHECK cannot see the OLD row, so the "you may not promote
-- yourself" rule is a trigger. Only a moderator/admin (or the service role,
-- which bypasses RLS but still hits this trigger) may change role, bans or
-- suspensions.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role)
     or (new.banned_at is distinct from old.banned_at)
     or (new.suspended_until is distinct from old.suspended_until)
  then
    -- auth.uid() is null when the service role acts outside a user session.
    if auth.uid() is not null and not public.is_admin(auth.uid()) then
      raise exception 'not authorised to change role, ban or suspension'
        using errcode = '42501';
    end if;
    if auth.uid() is not null and new.id = auth.uid()
       and new.role is distinct from old.role then
      raise exception 'an admin may not change their own role'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- --- recording consent ----------------------------------------------------
-- A room may only record if every current publisher has opted in.
create or replace function public.room_can_record(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.room_participants rp
    join public.profiles p on p.id = rp.user_id
    where rp.room_id = rid
      and rp.left_at is null
      and rp.role in ('host', 'cohost', 'speaker')
      and p.consent_recording = false
  );
$$;

-- --- live counters --------------------------------------------------------
create or replace function public.refresh_room_counts(rid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.rooms r
  set listener_count = (
        select count(*) from public.room_participants rp
        where rp.room_id = rid and rp.left_at is null),
      walking_count = (
        select count(*) from public.room_participants rp
        where rp.room_id = rid and rp.left_at is null and rp.is_walking)
  where r.id = rid;
$$;

create or replace function public.on_participant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_room_counts(coalesce(new.room_id, old.room_id));
  return coalesce(new, old);
end;
$$;

create trigger room_participants_counts
  after insert or update or delete on public.room_participants
  for each row execute function public.on_participant_change();

-- --- walk finalisation ----------------------------------------------------
-- Recomputes the summary from the stored points so a client cannot simply
-- POST "I walked 400 km".
create or replace function public.finalize_walk(p_walk_id uuid)
returns public.walks
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.walks;
  computed_m numeric := 0;
  secs integer := 0;
begin
  select * into w from public.walks where id = p_walk_id;
  if w is null then
    raise exception 'walk not found' using errcode = 'P0002';
  end if;
  if w.user_id <> auth.uid() and not public.is_admin(auth.uid()) then
    raise exception 'not your walk' using errcode = '42501';
  end if;

  with ordered as (
    select lat, lng, t,
           lag(lat) over (order by t) as plat,
           lag(lng) over (order by t) as plng
    from public.walk_points where walk_id = p_walk_id
  )
  select coalesce(sum(
    6371000 * 2 * asin(sqrt(
      power(sin(radians(lat - plat) / 2), 2) +
      cos(radians(plat)) * cos(radians(lat)) *
      power(sin(radians(lng - plng) / 2), 2)
    ))
  ), 0)
  into computed_m
  from ordered where plat is not null;

  select greatest(0, extract(epoch from (coalesce(w.ended_at, now()) - w.started_at))::int)
  into secs;

  update public.walks
  set distance_m = round(computed_m)::int,
      duration_s = secs,
      ended_at   = coalesce(ended_at, now()),
      avg_pace_s_per_km = case when computed_m > 50
                               then round(secs / (computed_m / 1000.0))::int
                               else null end
  where id = p_walk_id
  returning * into w;

  return w;
end;
$$;

-- --- audit helper ---------------------------------------------------------
create or replace function public.log_audit(
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_metadata);
$$;

-- --- updated_at -----------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
