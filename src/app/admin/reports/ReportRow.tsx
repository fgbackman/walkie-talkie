"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Report } from "@/types/database";

export default function ReportRow({ report }: { report: Report }) {
  const router = useRouter();
  const [resolution, setResolution] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolve(status: "actioned" | "dismissed") {
    start(async () => {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId: report.id, status, resolution }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Could not save.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="wt-card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="wt-label rounded border border-[var(--line)] px-2 py-0.5">
          {report.target_type}
        </span>
        <strong className="text-sm">{report.reason}</strong>
        <span className="wt-mono ml-auto text-xs text-[var(--ink-3)]">
          {new Date(report.created_at).toLocaleString()}
        </span>
      </div>

      {report.details && (
        <p className="mb-3 whitespace-pre-wrap rounded-xl bg-[var(--card-2)] p-3 text-sm text-[var(--ink-2)]">
          {report.details}
        </p>
      )}

      <p className="wt-mono mb-3 text-xs text-[var(--ink-3)]">
        target {report.target_id}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="wt-input flex-1"
          placeholder="What did you do? (saved to the audit log)"
          maxLength={500}
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
        />
        <button
          className="wt-btn wt-btn-red w-auto px-4"
          disabled={pending}
          onClick={() => resolve("actioned")}
        >
          Actioned
        </button>
        <button
          className="wt-btn wt-btn-ghost w-auto px-4"
          disabled={pending}
          onClick={() => resolve("dismissed")}
        >
          Dismiss
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-[var(--signal)]">{error}</p>}
    </li>
  );
}
