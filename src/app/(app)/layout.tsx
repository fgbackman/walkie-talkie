import TabBar from "@/components/TabBar";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col bg-[var(--paper)]">
      <div className="flex-1">{children}</div>
      <TabBar />
    </div>
  );
}
