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
