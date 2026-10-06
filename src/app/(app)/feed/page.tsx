import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import Avatar from "@/components/Avatar";
import { formatDuration } from "@/lib/geo";

export const metadata: Metadata = { title: "Feed" };
export const dynamic = "force-dynamic";

export default async function FeedPage() {
  await requireUser("/feed");
  const supabase = await supabaseServer();

  const { data: posts } = await supabase
    .from("posts")
    .select("id,author_id,kind,body,tags,created_at,walk_id")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(30);

  const authorIds = [...new Set((posts ?? []).map((p) => p.author_id))];
  const { data: authors } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("id,display_name,handle,avatar_url")
        .in("id", authorIds)
    : { data: [] };
  const byId = new Map((authors ?? []).map((a) => [a.id, a]));

  const walkIds = (posts ?? []).map((p) => p.walk_id).filter(Boolean) as string[];
  const { data: walks } = walkIds.length
    ? await supabase
        .from("walks")
        .select("id,distance_m,duration_s")
        .in("id", walkIds)
    : { data: [] };
  const walkById = new Map((walks ?? []).map((w) => [w.id, w]));

  return (
    <main className="px-4 pb-8 pt-5">
      <h1
        className="text-[27px] leading-none tracking-tight"
        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
      >
        Feed
      </h1>
      <p className="mb-5 mt-1 text-xs text-[var(--ink-3)]">
        Only the interests you picked. It ends.
      </p>

      {(posts ?? []).length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--ink-3)]">
          Nothing here yet. Finish a walk and share it.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {(posts ?? []).map((p) => {
            const a = byId.get(p.author_id);
            const w = p.walk_id ? walkById.get(p.walk_id) : null;
            return (
              <li key={p.id} className="wt-card p-3.5">
                <div className="mb-2 flex items-center gap-2.5">
                  <Avatar
                    name={a?.display_name ?? "?"}
                    src={a?.avatar_url}
                    id={p.author_id}
                    size={32}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {a?.display_name ?? "Someone"}
                    </p>
                    <p className="wt-mono truncate text-[10.5px] text-[var(--ink-3)]">
                      @{a?.handle}
                    </p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-[var(--ink-2)]">{p.body}</p>
                {w && (
                  <p className="wt-mono mt-2 text-[11.5px] text-[var(--ink-3)]">
                    {(w.distance_m / 1000).toFixed(2)} km · {formatDuration(w.duration_s)}
                  </p>
                )}
                {p.tags.length > 0 && (
                  <p className="wt-mono mt-2 text-[9.5px] uppercase tracking-wider text-[var(--ink-3)]">
                    {p.tags.map((t) => `#${t.replace(/\s/g, "")}`).join(" ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
