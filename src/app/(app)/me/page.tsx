import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import Avatar from "@/components/Avatar";

export const metadata: Metadata = { title: "Me" };
export const dynamic = "force-dynamic";

export default async function MePage() {
  const session = await requireUser("/me");
  const supabase = await supabaseServer();

  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: week } = await supabase
    .from("walks")
    .select("distance_m,duration_s")
    .eq("user_id", session.id)
    .gte("started_at", since);

  const weekM = (week ?? []).reduce((n, w) => n + w.distance_m, 0);
  const goal = session.profile.weekly_goal_m || 30000;
  const pct = Math.min(100, Math.round((weekM / goal) * 100));

  const isStaff =
    session.profile.role === "admin" || session.profile.role === "moderator";

  return (
    <main className="pb-8 pt-5">
      <div className="flex items-center gap-3.5 px-4 pb-4">
        <Avatar
          name={session.profile.display_name || session.profile.handle}
          src={session.profile.avatar_url}
          id={session.id}
          size={64}
        />
        <div className="min-w-0">
          <h1
            className="truncate text-[23px] tracking-tight"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
          >
            {session.profile.display_name || session.profile.handle}
          </h1>
          <p className="wt-mono text-[11.5px] text-[var(--amber)]">
            @{session.profile.handle}
            {session.profile.callsign ? ` · ${session.profile.callsign}` : ""}
          </p>
          {session.profile.bio && (
            <p className="mt-1 text-xs text-[var(--ink-3)]">{session.profile.bio}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px border-y border-[var(--line)] bg-[var(--line)]">
        {[
          { v: (weekM / 1000).toFixed(1), k: "km / week" },
          { v: String(week?.length ?? 0), k: "walks" },
          { v: `${pct}%`, k: "of goal" },
        ].map((s) => (
          <div key={s.k} className="bg-[var(--paper)] px-2 py-3 text-center">
            <div
              className="wt-mono tracking-tight"
              style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19 }}
            >
              {s.v}
            </div>
            <div className="wt-label mt-0.5 text-[8.5px]">{s.k}</div>
          </div>
        ))}
      </div>

      <nav className="mt-5 flex flex-col gap-2 px-4">
        <Link href="/settings/security" className="wt-card flex items-center justify-between p-3.5">
          <span>
            <span className="block text-sm font-semibold">Security</span>
            <span className="block text-xs text-[var(--ink-3)]">
              Two-step verification, sessions
            </span>
          </span>
          <span aria-hidden="true">›</span>
        </Link>

        <Link href="/settings/privacy" className="wt-card flex items-center justify-between p-3.5">
          <span>
            <span className="block text-sm font-semibold">Privacy</span>
            <span className="block text-xs text-[var(--ink-3)]">
              Location sharing, endpoint fuzzing, recording consent
            </span>
          </span>
          <span aria-hidden="true">›</span>
        </Link>

        {isStaff && (
          <Link href="/admin" className="wt-card flex items-center justify-between p-3.5">
            <span>
              <span className="block text-sm font-semibold">Admin console</span>
              <span className="block text-xs text-[var(--ink-3)]">
                Reports, users, live rooms, audit log
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        )}
      </nav>
    </main>
  );
}
