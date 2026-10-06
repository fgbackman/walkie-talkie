import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser();
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[520px] px-4 py-6">
      <Link href="/me" className="wt-label mb-4 inline-block">
        ‹ Back
      </Link>
      {children}
    </div>
  );
}
