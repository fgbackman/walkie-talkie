"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type R = {
  id: string;
  title: string;
  type: string;
  listener_count: number;
  walking_count: number;
  started_at: string;
  recording_enabled: boolean;
};

export default function RoomRow({ room }: { room: R }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    const reason = window.prompt("Why are you closing this room?") ?? "";
    if (!reason) return;
    start(async () => {
      const res = await fetch("/api/admin/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: room.id, action: "close", reason }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        return setError(b.error ?? "Could not close it.");
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{room.title}</p>
        <p className="wt-mono text-[11px] text-[var(--ink-3)]">
          {room.type} · {room.listener_count} listening · {room.walking_count} walking ·
          since {new Date(room.started_at).toLocaleTimeString()}
        </p>
      </div>
      {room.recording_enabled && (
        <span className="wt-label text-[var(--signal)]">recording</span>
      )}
      <button
        onClick={close}
        disabled={pending}
        className="rounded-lg border border-[var(--signal)] px-3 py-1.5 text-xs text-[var(--signal)] disabled:opacity-50"
      >
        Close room
      </button>
      {error && <p className="w-full text-sm text-[var(--signal)]">{error}</p>}
    </li>
  );
}
