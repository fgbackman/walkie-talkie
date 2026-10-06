import { requireModerator } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import ReportRow from "./ReportRow";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireModerator();
  const supabase = await supabaseServer();

  const { data: reports } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const open = (reports ?? []).filter((r) => r.status === "open");
  const closed = (reports ?? []).filter((r) => r.status !== "open");

  return (
    <main>
      <h1
        className="mb-1 text-2xl tracking-tight"
        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
      >
        Reports
      </h1>
      <p className="mb-6 text-sm text-[var(--ink-3)]">
        {open.length} waiting. Oldest first is usually the right order to work
        in, but anything about a live room should jump the queue.
      </p>

      {open.length === 0 ? (
        <p className="wt-card p-6 text-center text-sm text-[var(--ink-3)]">
          Nothing open. Good.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((r) => (
            <ReportRow key={r.id} report={r} />
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="wt-label mb-2 mt-8">Recently handled</h2>
          <ul className="wt-card divide-y divide-[var(--line-2)] text-sm">
            {closed.slice(0, 20).map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="wt-label">{r.status}</span>
                <span className="truncate">{r.reason}</span>
                <span className="wt-mono ml-auto text-xs text-[var(--ink-3)]">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
