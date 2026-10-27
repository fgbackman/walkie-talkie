import { guard, json, fail } from "@/lib/api";
import { roomTokenSchema } from "@/lib/validation";
import { supabaseServer } from "@/lib/supabase/server";
import { mintRoomToken } from "@/lib/livekit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The only place a LiveKit token is created.
 *
 * Publish rights come from the participant row in Postgres, so a user who
 * edits the request body still cannot grant themselves a microphone in a
 * guided room.
 */
export async function POST(request: Request) {
  const g = await guard(request, roomTokenSchema, {
    bucket: "livekit.token",
    max: 20,
    windowS: 60,
    failClosed: true,
  });
  if (!g.ok) return g.response;

  const supabase = await supabaseServer();

  // RLS already restricts which rooms are visible to this user.
  const { data: room } = await supabase
    .from("rooms")
    .select("id,title,type,livekit_room,is_live,host_id")
    .eq("id", g.body.roomId)
    .single();

  if (!room) return fail(404, "No such channel.");
  if (!room.is_live) return fail(409, "That channel has ended.");

  const { data: participant } = await supabase
    .from("room_participants")
    .select("role,muted_by_host,left_at")
    .eq("room_id", room.id)
    .eq("user_id", g.user.id)
    .maybeSingle();

  if (!participant || participant.left_at) {
    return fail(403, "Join the channel first.");
  }

  const speaks =
    participant.role === "host" ||
    participant.role === "cohost" ||
    participant.role === "speaker";

  // Ambient rooms are listen-only for everyone but the host.
  const ambientBlock = room.type === "ambient" && room.host_id !== g.user.id;

  const canPublish = speaks && !participant.muted_by_host && !ambientBlock;

  const token = await mintRoomToken({
    roomName: room.livekit_room,
    identity: g.user.id,
    name: g.user.profile.display_name || g.user.profile.handle,
    canPublish,
    metadata: {
      handle: g.user.profile.handle,
      avatar: g.user.profile.avatar_url,
      role: participant.role,
    },
  });

  return json({
    token,
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
    canPublish,
    role: participant.role,
    roomName: room.livekit_room,
  });
}
