import { guard, json, fail } from "@/lib/api";
import { startWalkSchema } from "@/lib/validation";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** POST /api/walks — start a walk. One open walk per person at a time. */
export async function POST(request: Request) {
  const g = await guard(request, startWalkSchema, {
    bucket: "walk.start",
    max: 20,
    windowS: 3600,
  });
  if (!g.ok) return g.response;

  const supabase = await supabaseServer();

  // Close any walk left open by a crashed tab, so the list stays honest.
  await supabase
    .from("walks")
    .update({ ended_at: new Date().toISOString() })
    .eq("user_id", g.user.id)
    .is("ended_at", null);

  const { data, error } = await supabase
    .from("walks")
    .insert({
      user_id: g.user.id,
      room_id: g.body.roomId,
      title: g.body.title,
      visibility: g.body.visibility,
    })
    .select("id,started_at,visibility")
    .single();

  if (error || !data) return fail(400, "Could not start the walk.");

  if (g.body.roomId) {
    await supabase
      .from("room_participants")
      .update({ is_walking: true })
      .eq("room_id", g.body.roomId)
      .eq("user_id", g.user.id);
  }

  return json({ walk: data }, { status: 201 });
}
