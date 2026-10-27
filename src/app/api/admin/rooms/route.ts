import { guard, json, fail } from "@/lib/api";
import { adminRoomActionSchema } from "@/lib/validation";
import { supabaseServer } from "@/lib/supabase/server";
import { closeRoom } from "@/lib/livekit";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const g = await guard(
    request,
    adminRoomActionSchema,
    { bucket: "admin.rooms", max: 60, windowS: 60 },
    { staff: "moderator" },
  );
  if (!g.ok) return g.response;

  const supabase = await supabaseServer();
  const { data: room } = await supabase
    .from("rooms")
    .select("id,livekit_room,title")
    .eq("id", g.body.roomId)
    .single();

  if (!room) return fail(404, "No such room.");

  if (g.body.action === "close") {
    await supabase
      .from("rooms")
      .update({
        is_live: false,
        ended_at: new Date().toISOString(),
        closed_by: g.user.id,
        close_reason: g.body.reason,
      })
      .eq("id", room.id);

    await supabase
      .from("room_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("room_id", room.id)
      .is("left_at", null);

    // Disconnect everyone from the media server too, or they keep talking
    // in a room the app believes is closed.
    try {
      await closeRoom(room.livekit_room);
    } catch {
      /* already gone */
    }
  } else {
    await supabase
      .from("rooms")
      .update({ recording_enabled: false })
      .eq("id", room.id);
  }

  await audit({
    actorId: g.user.id,
    action: `admin.room.${g.body.action}`,
    targetType: "room",
    targetId: room.id,
    metadata: { reason: g.body.reason, title: room.title },
  });

  return json({ ok: true });
}
