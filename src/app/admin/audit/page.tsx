import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requireAdmin();
  const supabase = await supabaseServer();

  const { data: entries } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const actorIds = [...new Set((entries ?? []).map((e) => e.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id,handle").in("id", actorIds)
    : { data: [] };
  const byId = new Map((actors ?? []).map((a) => [a.id, a.handle]));

  return (
    <main>
      <h1
        className="mb-1 text-2xl tracking-tight"
        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
      >
        Audit log
      </h1>
      <p className="mb-5 text-sm text-[var(--ink-3)]">
        Append-only. Nothing in the app can delete a row here.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left">
              <th className="wt-label py-2">When</th>
              <th className="wt-label py-2">Who</th>
              <th className="wt-label py-2">Action</th>
              <th className="wt-label py-2">Target</th>
              <th className="wt-label py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).map((e) => (
              <tr key={e.id} className="border-b border-[var(--line-2)]">
                <td className="wt-mono py-2 text-xs text-[var(--ink-3)]">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="wt-mono py-2 text-xs">
                  {e.actor_id ? `@${byId.get(e.actor_id) ?? "?"}` : "system"}
                </td>
                <td className="py-2">{e.action}</td>
                <td className="wt-mono py-2 text-xs text-[var(--ink-3)]">
                  {e.target_type ?? "—"}
                </td>
                <td className="wt-mono py-2 text-xs text-[var(--ink-3)]">
                  {JSON.stringify(e.metadata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
