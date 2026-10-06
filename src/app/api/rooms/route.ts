import { randomUUID } from "node:crypto";
import { guard, json, fail } from "@/lib/api";
import { createRoomSchema } from "@/lib/validation";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET /api/rooms — live rooms the caller may see (RLS decides). */
export async function GET() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("rooms")
    .select(
      "id,title,description,type,topics,target_pace_kmh,listener_count,walking_count,started_at,host_id,is_live",
    )
    .eq("is_live", true)
    .order("listener_count", { ascending: false })
    .limit(50);

  if (error) return fail(500, "Could not load rooms.");
  return json({ rooms: data ?? [] });
}

/** POST /api/rooms — open a channel. */
export async function POST(request: Request) {
  const g = await guard(request, createRoomSchema, {
    bucket: "room.create",
    max: 5,
    windowS: 300,
  });
  if (!g.ok) return g.response;

  const supabase = await supabaseServer();
  const livekitRoom = `wt_${randomUUID()}`;

  const { data, error } = await supabase
    .from("rooms")
    .insert({
      title: g.body.title,
      description: g.body.description,
      host_id: g.user.id,
      type: g.body.type,
      topics: g.body.topics,
      target_pace_kmh: g.body.targetPaceKmh,
      livekit_room: livekitRoom,
      // Recording is never on at creation; it needs consent from every
      // publisher, checked at the moment recording starts.
      recording_enabled: false,
      is_live: !g.body.goLiveOnWalk,
    })
    .select("id,title,livekit_room")
    .single();

  if (error || !data) return fail(400, error?.message ?? "Could not open the channel.");

  await supabase.from("room_participants").insert({
    room_id: data.id,
    user_id: g.user.id,
    role: "host",
  });

  await supabase.rpc("log_audit", {
    p_action: "room.create",
    p_target_type: "room",
    p_target_id: data.id,
    p_metadata: { title: data.title },
  });

  return json({ room: data }, { status: 201 });
}
