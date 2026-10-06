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
