import { guard, json, fail } from "@/lib/api";
import { hostActionSchema } from "@/lib/validation";
import { supabaseServer } from "@/lib/supabase/server";
import { forceMute, removeParticipant } from "@/lib/livekit";

export const dynamic = "force-dynamic";

/**
 * Host controls. The check is "are you the host of THIS room, or a
 * moderator" — done server-side against the database, never from a claim
 * the client sent.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(request, hostActionSchema, {
    bucket: "room.host",
    max: 60,
    windowS: 60,
  });
  if (!g.ok) return g.response;
  if (g.body.roomId !== id) return fail(400, "Room mismatch.");

  const supabase = await supabaseServer();

  const { data: room } = await supabase
    .from("rooms")
    .select("id,host_id,livekit_room")
    .eq("id", id)
    .single();
  if (!room) return fail(404, "No such channel.");

  const isHost = room.host_id === g.user.id;
  const isMod = g.user.profile.role === "admin" || g.user.profile.role === "moderator";
  if (!isHost && !isMod) return fail(403, "Only the host can do that.");
  if (g.body.targetUserId === room.host_id && !isMod) {
    return fail(403, "The host can't be removed by the host.");
  }

  switch (g.body.action) {
    case "mute":
      await supabase
        .from("room_participants")
        .update({ muted_by_host: true })
        .eq("room_id", id)
        .eq("user_id", g.body.targetUserId);
      await forceMute(room.livekit_room, g.body.targetUserId);
      break;

    case "unmute":
      await supabase
        .from("room_participants")
        .update({ muted_by_host: false })
        .eq("room_id", id)
        .eq("user_id", g.body.targetUserId);
      break;

    case "promote":
      await supabase
        .from("room_participants")
        .update({ role: "speaker", hand_raised: false })
        .eq("room_id", id)
        .eq("user_id", g.body.targetUserId);
      break;

    case "demote":
      await supabase
        .from("room_participants")
        .update({ role: "listener" })
        .eq("room_id", id)
        .eq("user_id", g.body.targetUserId);
      await forceMute(room.livekit_room, g.body.targetUserId);
      break;

    case "remove":
      await supabase
        .from("room_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("room_id", id)
        .eq("user_id", g.body.targetUserId);
      await removeParticipant(room.livekit_room, g.body.targetUserId);
      break;
  }

  await supabase.rpc("log_audit", {
    p_action: `room.${g.body.action}`,
    p_target_type: "user",
    p_target_id: g.body.targetUserId,
    p_metadata: { room_id: id },
  });

  return json({ ok: true });
}
