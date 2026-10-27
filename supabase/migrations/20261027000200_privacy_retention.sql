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
