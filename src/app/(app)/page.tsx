import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import Avatar from "@/components/Avatar";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const session = await requireUser();
  const supabase = await supabaseServer();

  const { data: rooms } = await supabase
    .from("rooms")
    .select(
      "id,title,description,type,topics,listener_count,walking_count,target_pace_kmh,host_id",
    )
    .eq("is_live", true)
    .order("listener_count", { ascending: false })
    .limit(40);

  const hostIds = [...new Set((rooms ?? []).map((r) => r.host_id))];
  const { data: hosts } = hostIds.length
    ? await supabase
        .from("profiles")
        .select("id,display_name,handle,avatar_url")
        .in("id", hostIds)
    : { data: [] };

  const hostById = new Map((hosts ?? []).map((h) => [h.id, h]));
  const walkingNow = (rooms ?? []).reduce((n, r) => n + r.walking_count, 0);

  return (
    <main>
      <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-5">
        <div>
          <h1
            className="text-[27px] leading-none tracking-tight"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
          >
            Channels
          </h1>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Hello {session.profile.display_name || session.profile.handle}
          </p>
        </div>
        <Link
          href="/rooms/new"
          className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--card)]"
          aria-label="Start a channel"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </header>

      <div className="mx-4 mb-4 flex items-center gap-3 rounded-2xl bg-[var(--teal-ghost)] px-4 py-3">
        <span
          className="wt-mono text-xl leading-none text-[var(--teal)]"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          {walkingNow}
        </span>
        <p className="text-[13px] text-[var(--ink-2)]">
          <strong className="text-[var(--ink)]">walking right now</strong>
          <br />
          across {rooms?.length ?? 0} live channels
        </p>
      </div>

      <div className="wt-label mx-4 mb-2 flex items-center gap-2">
        On air now
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>

      {(rooms ?? []).length === 0 ? (
        <div className="mx-4 rounded-2xl border border-dashed border-[var(--line)] p-6 text-center">
          <p className="mb-3 text-sm text-[var(--ink-2)]">
            Nothing is live. The quietest hour is the best time to start one.
          </p>
          <Link href="/rooms/new" className="wt-btn wt-btn-amber">
            Start a channel
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5 px-4 pb-6">
          {(rooms ?? []).map((room) => {
            const host = hostById.get(room.host_id);
            return (
              <li key={room.id}>
                <Link href={`/rooms/${room.id}`} className="wt-card block p-3.5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="wt-live">
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      LIVE
                    </span>
                    {room.topics.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--ink-3)]"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <h2
                    className="text-[17px] leading-tight tracking-tight"
                    style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
                  >
                    {room.title}
                  </h2>
                  <p className="mt-1 text-xs text-[var(--ink-3)]">
                    {host?.display_name ?? "Someone"} · {room.type} room
                    {room.target_pace_kmh ? ` · ${room.target_pace_kmh} km/h` : ""}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <Avatar
                      name={host?.display_name ?? "?"}
                      src={host?.avatar_url}
                      id={room.host_id}
                      size={26}
                    />
                    <span
                      className="wt-mono flex gap-3 text-[11.5px] text-[var(--ink-3)]"
                    >
                      <span>
                        <strong className="text-[var(--ink)]">{room.listener_count}</strong>{" "}
                        listening
                      </span>
                      <span className="text-[var(--teal)]">
                        <strong>{room.walking_count}</strong> walking
                      </span>
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
