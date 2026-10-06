"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";

type U = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  banned_at: string | null;
  suspended_until: string | null;
};

export default function UserRow({
  user,
  canAct,
  isSelf,
}: {
  user: U;
  canAct: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const suspended =
    user.suspended_until && new Date(user.suspended_until) > new Date();

  function act(action: string, days?: number) {
    const reason = window.prompt(`Reason for "${action}"? (goes in the audit log)`) ?? "";
    start(async () => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, action, days, reason }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        return setError(b.error ?? "Could not apply that.");
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar name={user.display_name || user.handle} src={user.avatar_url} id={user.id} size={34} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {user.display_name || user.handle}
        </p>
        <p className="wt-mono text-[11px] text-[var(--ink-3)]">@{user.handle}</p>
      </div>

      <div className="flex gap-1.5">
        {user.role !== "user" && <span className="wt-label">{user.role}</span>}
        {user.banned_at && (
          <span className="wt-label text-[var(--signal)]">banned</span>
        )}
        {suspended && <span className="wt-label text-[var(--amber)]">suspended</span>}
      </div>

      {canAct && !isSelf && (
        <div className="ml-auto flex flex-wrap gap-1.5">
          {user.banned_at ? (
            <Btn onClick={() => act("unban")} disabled={pending}>Unban</Btn>
          ) : (
            <>
              {suspended ? (
                <Btn onClick={() => act("unsuspend")} disabled={pending}>Unsuspend</Btn>
              ) : (
                <Btn onClick={() => act("suspend", 7)} disabled={pending}>Suspend 7d</Btn>
              )}
              <Btn danger onClick={() => act("ban")} disabled={pending}>Ban</Btn>
            </>
          )}
          {user.role === "user" ? (
            <Btn onClick={() => act("promote")} disabled={pending}>Make moderator</Btn>
          ) : (
            <Btn onClick={() => act("demote")} disabled={pending}>Demote</Btn>
          )}
        </div>
      )}
      {isSelf && <span className="wt-label ml-auto">that’s you</span>}
      {error && <p className="w-full text-sm text-[var(--signal)]">{error}</p>}
    </li>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-50"
      style={{
        borderColor: danger ? "var(--signal)" : "var(--line)",
        color: danger ? "var(--signal)" : "var(--ink-2)",
      }}
    >
      {children}
    </button>
  );
}
