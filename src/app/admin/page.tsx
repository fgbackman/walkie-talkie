import Link from "next/link";
import { requireModerator } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CountableTable = "profiles" | "rooms" | "reports" | "walks";

async function countRows(
  table: CountableTable,
  filter?: { column: string; op: "eq" | "gte"; value: string | boolean },
) {
  const supabase = await supabaseServer();
  const query = supabase.from(table).select("*", { count: "exact", head: true });
  const finished =
    filter?.op === "eq"
      ? query.eq(filter.column, filter.value)
      : filter?.op === "gte"
        ? query.gte(filter.column, filter.value)
        : query;
  const { count } = await finished;
  return count ?? 0;
}

export default async function AdminHome() {
  await requireModerator();

  const since = new Date(Date.now() - 864e5).toISOString();

  const [users, liveRooms, openReports, walks24] = await Promise.all([
    countRows("profiles"),
    countRows("rooms", { column: "is_live", op: "eq", value: true }),
    countRows("reports", { column: "status", op: "eq", value: "open" }),
    countRows("walks", { column: "started_at", op: "gte", value: since }),
  ]);

  const tiles: { label: string; value: number; href?: string; alert?: boolean }[] = [
    { label: "Members", value: users, href: "/admin/users" },
    { label: "Live rooms", value: liveRooms, href: "/admin/rooms" },
    {
      label: "Open reports",
      value: openReports,
      href: "/admin/reports",
      alert: openReports > 0,
    },
    { label: "Walks (24h)", value: walks24 },
  ];

  return (
    <main>
      <h1
        className="mb-5 text-2xl tracking-tight"
        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
      >
        Overview
      </h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => {
          const inner = (
            <div
              className="wt-card p-4"
              style={{
                borderColor: t.alert ? "var(--signal)" : undefined,
                background: t.alert ? "var(--signal-ghost)" : undefined,
              }}
            >
              <div className="wt-label">{t.label}</div>
              <div
                className="wt-mono mt-1 text-3xl tracking-tight"
                style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
              >
                {t.value}
              </div>
            </div>
          );
          return t.href ? (
            <Link key={t.label} href={t.href}>
              {inner}
            </Link>
          ) : (
            <div key={t.label}>{inner}</div>
          );
        })}
      </div>

      <section className="mt-8">
        <h2 className="wt-label mb-2">What a moderator can and cannot do</h2>
        <ul className="wt-card divide-y divide-[var(--line-2)] text-sm">
          {[
            ["Close a live room", "moderator + admin"],
            ["Resolve a report", "moderator + admin"],
            ["Remove or mute someone in a room", "moderator + admin"],
            ["Suspend or ban an account", "admin only"],
            ["Change someone's role", "admin only, never your own"],
            ["Read a user's GPS points", "nobody — not even an admin"],
          ].map(([what, who]) => (
            <li key={what} className="flex items-center justify-between px-4 py-2.5">
              <span>{what}</span>
              <span className="wt-label">{who}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
