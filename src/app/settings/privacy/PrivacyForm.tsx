"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type State = {
  shareLiveLocation: boolean;
  fuzzEndpoints: boolean;
  consentRecording: boolean;
};

const COPY: Record<keyof State, { title: string; hint: string }> = {
  shareLiveLocation: {
    title: "Share live location with my squad",
    hint: "Only people in a squad room with you, only while you're walking.",
  },
  fuzzEndpoints: {
    title: "Hide where my walks start and end",
    hint: "Trims the first and last 300 m from any route anyone else can see.",
  },
  consentRecording: {
    title: "Let rooms I speak in be recorded",
    hint: "A room can only record when every speaker has agreed. Off means rooms you speak in cannot be recorded at all.",
  },
};

export default function PrivacyForm({ initial }: { initial: State }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: keyof State) {
    const previous = state;
    const next = { ...previous, [key]: !previous[key] };
    setState(next);
    setSaving(true);
    setError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [key]: next[key] }),
    });
    setSaving(false);
    if (!res.ok) {
      // Optimistic update failed: put the switch back where it was.
      setState(previous);
      setError("Could not save that. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2.5">
      {(Object.keys(COPY) as (keyof State)[]).map((key) => (
        <div key={key} className="wt-card flex items-start gap-3 p-3.5">
          <div className="flex-1">
            <p className="text-sm font-semibold">{COPY[key].title}</p>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">{COPY[key].hint}</p>
          </div>
          <button
            role="switch"
            aria-checked={state[key]}
            aria-label={COPY[key].title}
            disabled={saving}
            onClick={() => toggle(key)}
            className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
            style={{ background: state[key] ? "var(--teal)" : "var(--line)" }}
          >
            <span
              className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-[var(--card)] transition-transform"
              style={{ left: 3, transform: state[key] ? "translateX(20px)" : "none" }}
            />
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-[var(--signal)]">
          {error}
        </p>
      )}
    </div>
  );
}
