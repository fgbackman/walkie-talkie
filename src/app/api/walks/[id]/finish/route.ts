import { guard, json, fail } from "@/lib/api";
import { finishWalkSchema } from "@/lib/validation";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Finish a walk.
 *
 * The client sends splits for display, but distance, duration and pace are
 * recomputed in Postgres from the stored points — a client cannot claim a
 * marathon it didn't walk.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(request, finishWalkSchema, {
    bucket: "walk.finish",
    max: 20,
    windowS: 3600,
  });
  if (!g.ok) return g.response;
  if (g.body.walkId !== id) return fail(400, "Walk mismatch.");

  const supabase = await supabaseServer();

  const { data: walk } = await supabase
    .from("walks")
    .select("id,user_id,room_id,ended_at")
    .eq("id", id)
    .single();

  if (!walk) return fail(404, "No such walk.");
  if (walk.user_id !== g.user.id) return fail(403, "Not your walk.");

  await supabase
    .from("walks")
    .update({ ended_at: walk.ended_at ?? new Date().toISOString() })
    .eq("id", id);

  if (g.body.splits.length) {
    await supabase.from("walk_splits").upsert(
      g.body.splits.map((s) => ({ walk_id: id, km: s.km, duration_s: s.durationS })),
      { onConflict: "walk_id,km" },
    );
  }

  const { data: finalized, error } = await supabase.rpc("finalize_walk", {
    p_walk_id: id,
  });
  if (error) return fail(400, "Could not finish the walk.");

  if (walk.room_id) {
    await supabase
      .from("room_participants")
      .update({ is_walking: false })
      .eq("room_id", walk.room_id)
      .eq("user_id", g.user.id);
  }

  return json({ walk: finalized });
}
