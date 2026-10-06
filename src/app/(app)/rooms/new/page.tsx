import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import NewRoomForm from "./NewRoomForm";

export const metadata: Metadata = { title: "Start a channel" };

export default async function NewRoomPage() {
  await requireUser("/rooms/new");
  return (
    <main className="px-4 pb-10 pt-5">
      <h1
        className="mb-1 text-[27px] tracking-tight"
        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
      >
        Start a channel
      </h1>
      <p className="mb-6 text-sm text-[var(--ink-3)]">
        No approval, no scheduling. It goes live the moment you finish.
      </p>
      <NewRoomForm />
    </main>
  );
}
