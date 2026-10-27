-- Walkie Talkie: all migrations, concatenated in order.
-- Paste into Supabase -> SQL Editor -> New query -> Run (new projects only).
-- Generated 2026-10-27T17:54:17Z. Do not edit; edit the migrations.

-- ========================================================================
-- supabase/migrations/20261006000000_extensions.sql
-- ========================================================================
-- Extensions live in their own schema so they never shadow public objects.
create schema if not exists extensions;

create extension if not exists "pgcrypto"  with schema extensions;
create extension if not exists "citext"    with schema extensions;

-- A private schema for things no API role may ever touch.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ========================================================================
-- supabase/migrations/20261006000100_schema.sql
-- ========================================================================
-- ===========================================================================
-- Walkie Talkie — core schema
-- Every table gets RLS in 20261006000300_rls.sql. Nothing is readable until
-- a policy says so.
-- ===========================================================================

-- --- enums ----------------------------------------------------------------
create type public.user_role      as enum ('user', 'moderator', 'admin');
create type public.room_type      as enum ('open', 'squad', 'guided', 'ambient');
create type public.participant_role as enum ('host', 'cohost', 'speaker', 'listener');
create type public.walk_visibility as enum ('private', 'followers', 'public');
create type public.post_kind      as enum ('walk', 'clip', 'text', 'challenge', 'room');
create type public.report_status  as enum ('open', 'actioned', 'dismissed');
create type public.report_target  as enum ('user', 'room', 'post', 'comment');

-- --- profiles -------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  handle              text        not null,
  callsign            text,
  display_name        text        not null default '',
  avatar_url          text,
  bio                 text        not null default '',
  role                public.user_role not null default 'user',
  interests           text[]      not null default '{}',

  -- privacy defaults deliberately chosen to be the safe ones
  share_live_location boolean     not null default false,
  fuzz_endpoints      boolean     not null default true,
  consent_recording   boolean     not null default false,

  weekly_goal_m       integer     not null default 30000,
  suspended_until     timestamptz,
  banned_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint handle_shape check (handle ~ '^[a-z0-9][a-z0-9._-]{2,29}$'),
  constraint bio_len      check (char_length(bio) <= 280),
  constraint goal_sane    check (weekly_goal_m between 0 and 1000000)
);
create unique index profiles_handle_key on public.profiles (lower(handle));
create index profiles_role_idx on public.profiles (role) where role <> 'user';

-- --- rooms ----------------------------------------------------------------
create table public.rooms (
  id               uuid primary key default extensions.gen_random_uuid(),
  title            text        not null,
  description      text        not null default '',
  host_id          uuid        not null references public.profiles (id) on delete cascade,
  type             public.room_type not null default 'open',
  topics           text[]      not null default '{}',
  target_pace_kmh  numeric(4,2),
  livekit_room     text        not null unique,
  is_live          boolean     not null default true,
  recording_enabled boolean    not null default false,
  max_participants integer     not null default 500,
  listener_count   integer     not null default 0,
  walking_count    integer     not null default 0,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  closed_by        uuid references public.profiles (id),
  close_reason     text,
  created_at       timestamptz not null default now(),

  constraint title_len check (char_length(title) between 3 and 80),
  constraint desc_len  check (char_length(description) <= 500),
  constraint topics_sane check (array_length(topics, 1) is null or array_length(topics, 1) <= 6),
  constraint cap_sane  check (max_participants between 2 and 5000)
);
create index rooms_live_idx    on public.rooms (is_live, started_at desc) where is_live;
create index rooms_host_idx    on public.rooms (host_id);
create index rooms_topics_idx  on public.rooms using gin (topics);

-- --- room participants ----------------------------------------------------
create table public.room_participants (
  room_id      uuid not null references public.rooms (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.participant_role not null default 'listener',
  hand_raised  boolean not null default false,
  is_walking   boolean not null default false,
  muted_by_host boolean not null default false,
  joined_at    timestamptz not null default now(),
  left_at      timestamptz,
  primary key (room_id, user_id)
);
create index room_participants_user_idx on public.room_participants (user_id) where left_at is null;
create index room_participants_live_idx on public.room_participants (room_id) where left_at is null;

-- --- walks ----------------------------------------------------------------
create table public.walks (
  id                uuid primary key default extensions.gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  room_id           uuid references public.rooms (id) on delete set null,
  title             text not null default '',
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  distance_m        integer not null default 0,
  duration_s        integer not null default 0,
  elevation_gain_m  integer not null default 0,
  steps             integer not null default 0,
  avg_pace_s_per_km integer,
  on_air_s          integer not null default 0,
  visibility        public.walk_visibility not null default 'followers',
  created_at        timestamptz not null default now(),

  constraint distance_sane check (distance_m between 0 and 500000),
  constraint duration_sane check (duration_s between 0 and 172800),
  constraint title_len     check (char_length(title) <= 120)
);
create index walks_user_idx on public.walks (user_id, started_at desc);
create index walks_room_idx on public.walks (room_id) where room_id is not null;

-- --- walk points ----------------------------------------------------------
-- The most sensitive table in the product. Owner-only, no exceptions,
-- not even for moderators.
create table public.walk_points (
  id          bigint generated always as identity primary key,
  walk_id     uuid not null references public.walks (id) on delete cascade,
  t           timestamptz not null,
  lat         double precision not null,
  lng         double precision not null,
  accuracy_m  real,
  altitude_m  real,
  speed_mps   real,
  constraint lat_range check (lat between -90 and 90),
  constraint lng_range check (lng between -180 and 180)
);
create index walk_points_walk_idx on public.walk_points (walk_id, t);

create table public.walk_splits (
  walk_id    uuid not null references public.walks (id) on delete cascade,
  km         integer not null,
  duration_s integer not null,
  primary key (walk_id, km),
  constraint km_sane check (km between 1 and 500)
);

-- --- social ---------------------------------------------------------------
create table public.posts (
  id         uuid primary key default extensions.gen_random_uuid(),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  kind       public.post_kind not null default 'text',
  body       text not null default '',
  tags       text[] not null default '{}',
  walk_id    uuid references public.walks (id) on delete set null,
  room_id    uuid references public.rooms (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  constraint body_len check (char_length(body) <= 2000)
);
create index posts_feed_idx on public.posts (created_at desc) where deleted_at is null;
create index posts_tags_idx on public.posts using gin (tags);
create index posts_author_idx on public.posts (author_id);

create table public.comments (
  id         uuid primary key default extensions.gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint comment_len check (char_length(body) between 1 and 1000)
);
create index comments_post_idx on public.comments (post_id, created_at);

create table public.post_reactions (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind    text not null default 'like',
  primary key (post_id, user_id, kind),
  constraint kind_len check (char_length(kind) <= 16)
);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

-- --- moderation -----------------------------------------------------------
create table public.reports (
  id          uuid primary key default extensions.gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target not null,
  target_id   uuid not null,
  reason      text not null,
  details     text not null default '',
  status      public.report_status not null default 'open',
  handled_by  uuid references public.profiles (id),
  handled_at  timestamptz,
  resolution  text,
  created_at  timestamptz not null default now(),
  constraint reason_len  check (char_length(reason) between 2 and 60),
  constraint details_len check (char_length(details) <= 1000)
);
create index reports_open_idx on public.reports (created_at desc) where status = 'open';

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx   on public.audit_log (actor_id, created_at desc);

-- --- one-shot admin bootstrap --------------------------------------------
-- Seeded by the operator; consumed (and the row deleted) the first time the
-- matching email signs in. Lives in `private` so no API role can read it.
create table private.admin_bootstrap (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- ========================================================================
-- supabase/migrations/20261006000200_functions.sql
-- ========================================================================
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

-- ========================================================================
-- supabase/migrations/20261006000300_rls.sql
-- ========================================================================
-- ===========================================================================
-- Row Level Security.
--
-- Baseline: RLS on, force it for the table owner too, and no policy means
-- no access. Policies below grant the minimum each role needs.
-- ===========================================================================

alter table public.profiles          enable row level security;
alter table public.rooms             enable row level security;
alter table public.room_participants enable row level security;
alter table public.walks             enable row level security;
alter table public.walk_points       enable row level security;
alter table public.walk_splits       enable row level security;
alter table public.posts             enable row level security;
alter table public.comments          enable row level security;
alter table public.post_reactions    enable row level security;
alter table public.follows           enable row level security;
alter table public.blocks            enable row level security;
alter table public.reports           enable row level security;
alter table public.audit_log         enable row level security;

-- --- profiles -------------------------------------------------------------
create policy profiles_read on public.profiles
  for select to authenticated
  using (
    banned_at is null
    or id = (select auth.uid())
    or public.is_moderator((select auth.uid()))
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_moderate on public.profiles
  for update to authenticated
  using (public.is_admin((select auth.uid())));

-- --- rooms ----------------------------------------------------------------
create policy rooms_read on public.rooms
  for select to authenticated
  using (
    public.is_moderator((select auth.uid()))
    or host_id = (select auth.uid())
    or type <> 'squad'
    or public.in_room(id, (select auth.uid()))
  );

create policy rooms_create on public.rooms
  for insert to authenticated
  with check (
    host_id = (select auth.uid())
    and public.is_active((select auth.uid()))
  );

create policy rooms_update_host on public.rooms
  for update to authenticated
  using (host_id = (select auth.uid()) or public.is_moderator((select auth.uid())))
  with check (host_id = (select auth.uid()) or public.is_moderator((select auth.uid())));

-- --- room participants ----------------------------------------------------
create policy room_participants_read on public.room_participants
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.in_room(room_id, (select auth.uid()))
    or public.is_moderator((select auth.uid()))
  );

create policy room_participants_join on public.room_participants
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active((select auth.uid()))
    and exists (select 1 from public.rooms r where r.id = room_id and r.is_live)
  );

create policy room_participants_update_self on public.room_participants
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy room_participants_update_host on public.room_participants
  for update to authenticated
  using (
    exists (select 1 from public.rooms r
            where r.id = room_id and r.host_id = (select auth.uid()))
    or public.is_moderator((select auth.uid()))
  );

create policy room_participants_leave on public.room_participants
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.rooms r
               where r.id = room_id and r.host_id = (select auth.uid()))
    or public.is_moderator((select auth.uid()))
  );

-- --- walks ----------------------------------------------------------------
create policy walks_read on public.walks
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or visibility = 'public'
    or (visibility = 'followers'
        and public.follows_user((select auth.uid()), user_id))
  );

create policy walks_insert_own on public.walks
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_active((select auth.uid())));

create policy walks_update_own on public.walks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy walks_delete_own on public.walks
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- walk points: owner only, full stop -----------------------------------
create policy walk_points_owner_read on public.walk_points
  for select to authenticated
  using (exists (select 1 from public.walks w
                 where w.id = walk_id and w.user_id = (select auth.uid())));

create policy walk_points_owner_write on public.walk_points
  for insert to authenticated
  with check (exists (select 1 from public.walks w
                      where w.id = walk_id
                        and w.user_id = (select auth.uid())
                        and w.ended_at is null));

create policy walk_points_owner_delete on public.walk_points
  for delete to authenticated
  using (exists (select 1 from public.walks w
                 where w.id = walk_id and w.user_id = (select auth.uid())));

-- --- splits follow the walk's visibility ----------------------------------
create policy walk_splits_read on public.walk_splits
  for select to authenticated
  using (exists (
    select 1 from public.walks w
    where w.id = walk_id
      and (w.user_id = (select auth.uid())
           or w.visibility = 'public'
           or (w.visibility = 'followers'
               and public.follows_user((select auth.uid()), w.user_id)))
  ));

create policy walk_splits_write on public.walk_splits
  for insert to authenticated
  with check (exists (select 1 from public.walks w
                      where w.id = walk_id and w.user_id = (select auth.uid())));

-- --- posts ----------------------------------------------------------------
create policy posts_read on public.posts
  for select to authenticated
  using (
    deleted_at is null
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = author_id)
         or (b.blocker_id = author_id and b.blocked_id = (select auth.uid()))
    )
  );

create policy posts_read_moderator on public.posts
  for select to authenticated
  using (public.is_moderator((select auth.uid())));

create policy posts_insert_own on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_active((select auth.uid())));

create policy posts_update_own on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()) or public.is_moderator((select auth.uid())))
  with check (author_id = (select auth.uid()) or public.is_moderator((select auth.uid())));

-- --- comments / reactions -------------------------------------------------
create policy comments_read on public.comments
  for select to authenticated
  using (deleted_at is null or public.is_moderator((select auth.uid())));

create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_active((select auth.uid())));

create policy comments_update_own on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()) or public.is_moderator((select auth.uid())));

create policy reactions_read on public.post_reactions
  for select to authenticated using (true);

create policy reactions_write_own on public.post_reactions
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy reactions_delete_own on public.post_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- --- follows / blocks -----------------------------------------------------
create policy follows_read on public.follows
  for select to authenticated using (true);

create policy follows_write_own on public.follows
  for insert to authenticated with check (follower_id = (select auth.uid()));

create policy follows_delete_own on public.follows
  for delete to authenticated using (follower_id = (select auth.uid()));

create policy blocks_own on public.blocks
  for all to authenticated
  using (blocker_id = (select auth.uid()))
  with check (blocker_id = (select auth.uid()));

-- --- reports --------------------------------------------------------------
create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create policy reports_read on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_moderator((select auth.uid())));

create policy reports_handle on public.reports
  for update to authenticated
  using (public.is_moderator((select auth.uid())))
  with check (public.is_moderator((select auth.uid())));

-- --- audit log: admins read, nobody writes through the API ---------------
create policy audit_read_admin on public.audit_log
  for select to authenticated
  using (public.is_admin((select auth.uid())));

-- ========================================================================
-- supabase/migrations/20261006000400_grants.sql
-- ========================================================================
-- ===========================================================================
-- Grants.
--
-- Supabase ships broad default privileges to `anon` and `authenticated`.
-- We revoke them and hand back only what the app needs, so a mistake in a
-- policy fails closed rather than exposing a whole table.
-- ===========================================================================

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;

-- anon can do nothing but authenticate. Not one table.
-- authenticated gets per-table verbs; RLS then decides which rows.
grant select, update                 on public.profiles          to authenticated;
grant select, insert, update         on public.rooms             to authenticated;
grant select, insert, update, delete on public.room_participants to authenticated;
grant select, insert, update, delete on public.walks             to authenticated;
grant select, insert, delete         on public.walk_points       to authenticated;
grant select, insert                 on public.walk_splits       to authenticated;
grant select, insert, update         on public.posts             to authenticated;
grant select, insert, update         on public.comments          to authenticated;
grant select, insert, delete         on public.post_reactions    to authenticated;
grant select, insert, delete         on public.follows           to authenticated;
grant select, insert, delete         on public.blocks            to authenticated;
grant select, insert, update         on public.reports           to authenticated;
grant select                         on public.audit_log         to authenticated;

grant usage on all sequences in schema public to authenticated;

grant execute on function public.is_admin(uuid)        to authenticated;
grant execute on function public.is_moderator(uuid)    to authenticated;
grant execute on function public.is_active(uuid)       to authenticated;
grant execute on function public.in_room(uuid, uuid)   to authenticated;
grant execute on function public.follows_user(uuid, uuid) to authenticated;
grant execute on function public.room_can_record(uuid) to authenticated;
grant execute on function public.finalize_walk(uuid)   to authenticated;
grant execute on function public.log_audit(text, text, uuid, jsonb) to authenticated;

-- Never reachable from the API roles.
revoke all on schema private from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;

-- ========================================================================
-- supabase/migrations/20261006000500_ratelimit.sql
-- ========================================================================
-- ===========================================================================
-- Rate limiting in Postgres.
--
-- An in-process counter is useless on serverless: every cold start gets a
-- fresh one. This is a fixed-window counter in the database, so the limit
-- holds across every Netlify instance. Called only with the service role.
-- ===========================================================================

create table private.rate_limits (
  bucket      text        not null,
  window_start timestamptz not null,
  hits        integer     not null default 0,
  primary key (bucket, window_start)
);

create index rate_limits_window_idx on private.rate_limits (window_start);

-- Returns true when the call is allowed, false when the bucket is exhausted.
create or replace function private.consume_rate_limit(
  p_bucket   text,
  p_limit    integer,
  p_window_s integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  w timestamptz;
  n integer;
begin
  w := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);

  insert into private.rate_limits (bucket, window_start, hits)
  values (p_bucket, w, 1)
  on conflict (bucket, window_start)
  do update set hits = private.rate_limits.hits + 1
  returning hits into n;

  return n <= p_limit;
end;
$$;

-- Housekeeping: drop windows older than a day.
create or replace function private.prune_rate_limits()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.rate_limits where window_start < now() - interval '1 day';
$$;

revoke all on function private.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;

-- ========================================================================
-- supabase/migrations/20261006000600_realtime.sql
-- ========================================================================
-- Realtime: the client subscribes to participant and room changes so the
-- stage updates without polling. RLS still applies to realtime payloads.
alter publication supabase_realtime add table public.room_participants;
alter publication supabase_realtime add table public.rooms;

-- Replica identity full so UPDATE payloads carry the old row too.
alter table public.room_participants replica identity full;
alter table public.rooms replica identity full;

-- ========================================================================
-- supabase/migrations/20261006000700_ratelimit_rpc.sql
-- ========================================================================
-- A thin public wrapper so PostgREST can reach the limiter. Execution is
-- revoked from both API roles; only the service role may call it, and the
-- service role is only ever used server-side.
create or replace function public.consume_rate_limit(
  p_bucket   text,
  p_limit    integer,
  p_window_s integer
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.consume_rate_limit(p_bucket, p_limit, p_window_s);
$$;

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;

-- ========================================================================
-- supabase/migrations/20261027000100_security_hardening.sql
-- ========================================================================
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

-- ========================================================================
-- supabase/migrations/20261027000200_privacy_retention.sql
-- ========================================================================
-- ===========================================================================
-- Privacy: account deletion and location-history retention.
--
-- Deleting an account (auth.admin.deleteUser) cascades from auth.users to
-- profiles and from there to everything the person owns: walks, GPS points,
-- posts, comments, follows, reports they filed, room seats, rooms they host.
-- Three references to *staff* accounts had no ON DELETE rule, which made a
-- moderator who had ever closed a room or handled a report undeletable.
-- ===========================================================================

alter table public.rooms
  drop constraint if exists rooms_closed_by_fkey,
  add constraint rooms_closed_by_fkey
    foreign key (closed_by) references public.profiles (id) on delete set null;

alter table public.posts
  drop constraint if exists posts_deleted_by_fkey,
  add constraint posts_deleted_by_fkey
    foreign key (deleted_by) references public.profiles (id) on delete set null;

alter table public.reports
  drop constraint if exists reports_handled_by_fkey,
  add constraint reports_handled_by_fkey
    foreign key (handled_by) references public.profiles (id) on delete set null;


-- --- GPS retention --------------------------------------------------------
-- Raw fixes are the most sensitive data we hold and are only needed to
-- compute a walk's summary, which finalize_walk() stores on `walks`. After
-- the retention window the points go; distance, duration, pace and splits
-- stay. A walk that was never finished counts from two days after it began.
create or replace function public.prune_walk_points(p_keep interval default interval '90 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.walk_points wp
  using public.walks w
  where w.id = wp.walk_id
    and coalesce(w.ended_at, w.started_at + interval '2 days') < now() - p_keep;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.prune_walk_points(interval) from public, anon, authenticated;

-- Schedule it (and the rate-limit housekeeping that was never scheduled)
-- where pg_cron exists — it does on Supabase. Elsewhere, run them from any
-- scheduler: `select public.prune_walk_points(); select private.prune_rate_limits();`
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('walkie-prune-walk-points', '17 3 * * *',
                          'select public.prune_walk_points()');
    perform cron.schedule('walkie-prune-rate-limits', '23 * * * *',
                          'select private.prune_rate_limits()');
  else
    raise notice 'pg_cron is not available: schedule public.prune_walk_points() and private.prune_rate_limits() yourself';
  end if;
end;
$$;

