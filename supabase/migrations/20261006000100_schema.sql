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
