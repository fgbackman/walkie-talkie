-- Realtime: the client subscribes to participant and room changes so the
-- stage updates without polling. RLS still applies to realtime payloads.
alter publication supabase_realtime add table public.room_participants;
alter publication supabase_realtime add table public.rooms;

-- Replica identity full so UPDATE payloads carry the old row too.
alter table public.room_participants replica identity full;
alter table public.rooms replica identity full;
