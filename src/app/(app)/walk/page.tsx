import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import WalkClient from "./WalkClient";

export const metadata: Metadata = { title: "Walk" };
export const dynamic = "force-dynamic";

export default async function WalkPage() {
  const session = await requireUser("/walk");
  const supabase = await supabaseServer();

  const { data: recent } = await supabase
    .from("walks")
    .select("id,title,distance_m,duration_s,started_at")
    .eq("user_id", session.id)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(5);

  const { data: openRoom } = await supabase
    .from("room_participants")
    .select("room_id, rooms(id,title,listener_count)")
    .eq("user_id", session.id)
    .is("left_at", null)
    .limit(1)
    .maybeSingle();

  const room = (openRoom?.rooms ?? null) as
    | { id: string; title: string; listener_count: number }
    | null;

  return (
    <WalkClient
      recent={recent ?? []}
      activeRoom={room}
      defaultVisibility={session.profile.share_live_location ? "followers" : "private"}
    />
  );
}
