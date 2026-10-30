-- ===========================================================================
-- Data integrity: low-severity findings from the 2026-10-27 review.
--
-- 1. Walk stats are computed by finalize_walk() from stored GPS points, but
--    a user could still write distance, duration and pace straight through
--    the API (table-wide INSERT/UPDATE grants). Column grants now allow only
--    what the app writes; a trigger keeps ended_at honest.
-- 2. Post tags were limited only in the API schema, and posts are written
--    directly through PostgREST, so the database now enforces the limits.
-- ===========================================================================


-- --- 1. Walks --------------------------------------------------------------
revoke insert, update on public.walks from authenticated;

-- `id` is allowed so a client may choose its own uuid; started_at, the stats
-- and ended_at always come from the database.
grant insert (id, user_id, room_id, title, visibility) on public.walks to authenticated;
grant update (title, visibility, ended_at)              on public.walks to authenticated;

-- A walk ends once, no later than now. Re-opening a finished walk would let
-- points be appended to it; a future end time would inflate its duration.
create or replace function public.guard_walk_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The service role is trusted. finalize_walk() runs as the user and passes
  -- these checks: it only fills in a missing ended_at.
  if auth.uid() is null then
    return new;
  end if;

  if old.ended_at is not null and new.ended_at is distinct from old.ended_at then
    raise exception 'a finished walk cannot be reopened or re-timed'
      using errcode = '42501';
  end if;

  if new.ended_at is not null and new.ended_at > now() then
    new.ended_at := now();
  end if;
  if new.ended_at is not null and new.ended_at < new.started_at then
    raise exception 'a walk cannot end before it starts' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists walks_guard_end on public.walks;
create trigger walks_guard_end
  before update on public.walks
  for each row execute function public.guard_walk_end();


-- --- 2. Post tags ----------------------------------------------------------
-- Mirrors createPostSchema: at most 8 tags, each 1–24 characters.
-- NOT VALID: enforced for every new or edited row without failing the
-- migration on any existing data. Run `validate constraint` later to check
-- the old rows too.
create or replace function public.tags_ok(tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(tags), 0) <= 8
     and coalesce(bool_and(char_length(t) between 1 and 24), true)
  from unnest(tags) as t;
$$;

alter table public.posts
  drop constraint if exists tags_sane,
  add constraint tags_sane check (public.tags_ok(tags)) not valid;
