"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TOPICS = ["Morning", "Night", "Trail", "Dogs", "Support", "Zone 2", "Birding", "Stroller"];
const TYPES = [
  { v: "open", label: "Open", hint: "Anyone can drop in and ask for the mic" },
  { v: "squad", label: "Squad", hint: "Only people you've added" },
  { v: "guided", label: "Guided", hint: "You lead; hands up to speak" },
  { v: "ambient", label: "Ambient", hint: "Nobody talks — shared sound only" },
] as const;

export default function NewRoomForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["v"]>("open");
  const [topics, setTopics] = useState<string[]>([]);
  const [pace, setPace] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        type,
        topics,
        targetPaceKmh: pace,
        goLiveOnWalk: false,
        recordingEnabled: false,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Could not open the channel.");
    router.push(`/rooms/${body.room.id}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <label htmlFor="title" className="wt-label mb-2 block">
          Channel name
        </label>
        <input
          id="title"
          className="wt-input"
          required
          minLength={3}
          maxLength={80}
          placeholder="Slow miles, loud opinions"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="desc" className="wt-label mb-2 block">
          What’s it about
        </label>
        <input
          id="desc"
          className="wt-input"
          maxLength={500}
          placeholder="Flat routes, no advice unless asked"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <fieldset>
        <legend className="wt-label mb-2">Topics</legend>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => {
            const on = topics.includes(t);
            return (
              <button
                key={t}
                type="button"
                className="wt-chip"
                aria-pressed={on}
                onClick={() =>
                  setTopics((prev) =>
                    on ? prev.filter((x) => x !== t) : prev.length < 6 ? [...prev, t] : prev,
                  )
                }
              >
                {t}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="wt-label mb-2">Room type</legend>
        <div className="flex flex-col gap-2">
          {TYPES.map((t) => (
            <label
              key={t.v}
              className="flex cursor-pointer items-start gap-3 rounded-xl border p-3"
              style={{
                borderColor: type === t.v ? "var(--amber)" : "var(--line)",
                background: type === t.v ? "var(--amber-ghost)" : "var(--card)",
              }}
            >
              <input
                type="radio"
                name="type"
                className="mt-1"
                checked={type === t.v}
                onChange={() => setType(t.v)}
              />
              <span>
                <span className="block text-sm font-semibold">{t.label}</span>
                <span className="block text-xs text-[var(--ink-3)]">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="wt-label mb-2">Target pace</legend>
        <div className="flex flex-wrap gap-2">
          {[null, 4.8, 5.4, 6.1].map((p) => (
            <button
              key={String(p)}
              type="button"
              className="wt-chip"
              aria-pressed={pace === p}
              onClick={() => setPace(p)}
            >
              {p === null ? "Any pace" : `${p} km/h`}
            </button>
          ))}
        </div>
      </fieldset>

      <button type="submit" className="wt-btn wt-btn-amber" disabled={busy || title.length < 3}>
        {busy ? "Opening…" : "Go live"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-[var(--signal)]">
          {error}
        </p>
      )}
    </form>
  );
}
