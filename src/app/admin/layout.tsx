import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModerator, hasAal2 } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/rooms", label: "Live rooms" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireModerator();

  /**
   * Middleware already gates /admin on AAL2, but a layout that trusts
   * middleware alone breaks silently the day someone edits the matcher.
   * If the account has a TOTP factor enrolled, the session must have used it.
   */
  const supabase = await supabaseServer();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasFactor = (factors?.totp ?? []).some((f) => f.status === "verified");
  if (hasFactor && !(await hasAal2())) {
    redirect("/auth/mfa?next=/admin");
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-5xl px-5 py-6">
      <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--line)] pb-4">
        <Link
          href="/admin"
          className="text-xl tracking-tight"
          style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}
        >
          Walkie Talkie <span className="text-[var(--amber)]">admin</span>
        </Link>
        <span className="wt-label rounded border border-[var(--line)] px-2 py-0.5">
          {session.profile.role}
        </span>
        {!hasFactor && (
          <Link
            href="/settings/security"
            className="rounded-lg bg-[var(--signal-ghost)] px-2.5 py-1 text-xs text-[var(--signal)]"
          >
            Set up two-step verification
          </Link>
        )}
        <nav className="ml-auto flex flex-wrap gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg px-3 py-1.5 text-sm text-[var(--ink-2)] hover:bg-[var(--card-2)]"
            >
              {n.label}
            </Link>
          ))}
          <Link href="/" className="rounded-lg px-3 py-1.5 text-sm text-[var(--ink-3)]">
            Exit
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
