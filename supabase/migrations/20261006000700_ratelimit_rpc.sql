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
