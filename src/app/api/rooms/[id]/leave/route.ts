import { json } from "@/lib/api";
import { getApiUser } from "@/lib/auth";
import { fail } from "@/lib/api";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getApiUser();
  if (!user) return fail(401, "Sign in first.");

  const supabase = await supabaseServer();
  await supabase
    .from("room_participants")
    .update({ left_at: new Date().toISOString(), hand_raised: false })
    .eq("room_id", id)
    .eq("user_id", user.id);

  // A host leaving ends the room — no zombie channels on the list.
  const { data: room } = await supabase
    .from("rooms")
    .select("id,host_id")
    .eq("id", id)
    .single();

  if (room?.host_id === user.id) {
    await supabase
      .from("rooms")
      .update({ is_live: false, ended_at: new Date().toISOString() })
      .eq("id", id);
  }

  return json({ ok: true });
}
