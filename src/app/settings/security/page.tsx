import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import MfaSetup from "./MfaSetup";

export const metadata: Metadata = { title: "Security" };
export const dynamic = "force-dynamic";

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  const session = await requireUser("/settings/security");
  const { required } = await searchParams;
  const isStaff = session.profile.role === "admin" || session.profile.role === "moderator";

  return (
    <main>
      <h1
        className="mb-1 text-2xl tracking-tight"
        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
      >
        Security
      </h1>
      <p className="mb-6 text-sm text-[var(--ink-3)]">
        Two-step verification means a stolen password or a hijacked email inbox
        isn’t enough to get into your account.
      </p>
      {isStaff && required === "staff" && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-[var(--signal-ghost)] p-3 text-sm text-[var(--signal)]"
        >
          The admin console needs two-step verification. Turn it on below,
          then open the console again.
        </p>
      )}
      <MfaSetup />
    </main>
  );
}
