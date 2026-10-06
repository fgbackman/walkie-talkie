import { requireModerator } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import RoomRow from "./RoomRow";

export const dynamic = "force-dynamic";

export default async function AdminRoomsPage() {
  await requireModerator();
  const supabase = await supabaseServer();

  const { data: rooms } = await supabase
    .from("rooms")
    .select("id,title,type,host_id,listener_count,walking_count,started_at,recording_enabled")
    .eq("is_live", true)
    .order("listener_count", { ascending: false })
    .limit(100);

  return (
    <main>
      <h1
        className="mb-1 text-2xl tracking-tight"
        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
      >
        Live rooms
      </h1>
      <p className="mb-5 text-sm text-[var(--ink-3)]">
        Closing a room disconnects everyone in it immediately and writes an
        audit entry with your name on it.
      </p>

      {(rooms ?? []).length === 0 ? (
        <p className="wt-card p-6 text-center text-sm text-[var(--ink-3)]">
          Nothing live right now.
        </p>
      ) : (
        <ul className="wt-card divide-y divide-[var(--line-2)]">
          {(rooms ?? []).map((r) => (
            <RoomRow key={r.id} room={r} />
          ))}
        </ul>
      )}
    </main>
  );
}
