import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import RoomClient from "./RoomClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data } = await supabase.from("rooms").select("title").eq("id", id).single();
  return { title: data?.title ?? "Channel" };
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireUser(`/rooms/${id}`);
  const supabase = await supabaseServer();

  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", id)
    .single();

  if (!room) notFound();

  const { data: host } = await supabase
    .from("profiles")
    .select("id,display_name,handle,avatar_url")
    .eq("id", room.host_id)
    .single();

  return (
    <RoomClient
      room={{
        id: room.id,
        title: room.title,
        description: room.description,
        type: room.type,
        isLive: room.is_live,
        hostId: room.host_id,
        hostName: host?.display_name ?? "Host",
        targetPace: room.target_pace_kmh,
      }}
      me={{
        id: session.id,
        name: session.profile.display_name || session.profile.handle,
        avatar: session.profile.avatar_url,
      }}
    />
  );
}
