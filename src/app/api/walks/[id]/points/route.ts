import { guard, json, fail } from "@/lib/api";
import { walkPointsSchema } from "@/lib/validation";
import { supabaseServer } from "@/lib/supabase/server";
import type { WalkPointInsert } from "@/types/database";

export const dynamic = "force-dynamic";

/**
 * Batched GPS fixes. The client buffers locally and flushes every few
 * seconds, so a tunnel or a locked screen doesn't lose the track.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(request, walkPointsSchema, {
    bucket: "walk.points",
    max: 120,
    windowS: 60,
  });
  if (!g.ok) return g.response;
  if (g.body.walkId !== id) return fail(400, "Walk mismatch.");

  const supabase = await supabaseServer();

  // RLS also enforces this; checking here gives a clearer error.
  const { data: walk } = await supabase
    .from("walks")
    .select("id,user_id,ended_at")
    .eq("id", id)
    .single();

  if (!walk) return fail(404, "No such walk.");
  if (walk.user_id !== g.user.id) return fail(403, "Not your walk.");
  if (walk.ended_at) return fail(409, "That walk is already finished.");

  const rows: WalkPointInsert[] = g.body.points.map((p) => ({
    walk_id: id,
    t: p.t,
    lat: p.lat,
    lng: p.lng,
    accuracy_m: p.accuracy ?? null,
    altitude_m: p.altitude ?? null,
    speed_mps: p.speed ?? null,
  }));

  const { error } = await supabase.from("walk_points").insert(rows);
  if (error) return fail(400, "Could not store those points.");

  return json({ stored: rows.length });
}
