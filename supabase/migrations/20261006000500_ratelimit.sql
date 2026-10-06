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
