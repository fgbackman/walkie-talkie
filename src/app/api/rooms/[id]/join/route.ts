import { guard, json, fail } from "@/lib/api";
import { joinRoomSchema } from "@/lib/validation";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(request, joinRoomSchema.partial(), {
    bucket: "room.join",
    max: 30,
    windowS: 60,
  });
  if (!g.ok) return g.response;

  const supabase = await supabaseServer();

  const { data: room } = await supabase
    .from("rooms")
    .select("id,is_live,max_participants,listener_count")
    .eq("id", id)
    .single();

  if (!room) return fail(404, "That channel isn't there.");
  if (!room.is_live) return fail(409, "That channel has ended.");
  if (room.listener_count >= room.max_participants) {
    return fail(409, "That channel is full.");
  }

  // No role in the payload: a new seat is a listener (the database forces
  // it), and rejoining keeps whatever role the host gave you. Someone the
  // host removed is refused by the database.
  const { error } = await supabase
    .from("room_participants")
    .upsert(
      { room_id: id, user_id: g.user.id, left_at: null },
      { onConflict: "room_id,user_id" },
    );

  if (error) return fail(403, "You can't join that channel.");
  return json({ ok: true });
}
