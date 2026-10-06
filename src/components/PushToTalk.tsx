"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Push-to-talk.
 *
 * Holding is the whole interaction, so it has to survive a thumb sliding off
 * the button, the tab losing focus mid-sentence, and the spacebar on desktop.
 * Pointer capture handles the first; a blur listener handles the second.
 */
export default function PushToTalk({
  canPublish,
  onChange,
  disabled,
}: {
  canPublish: boolean;
  onChange: (live: boolean) => void;
  disabled?: boolean;
}) {
  const [live, setLive] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const liveRef = useRef(false);

  const set = useCallback(
    (next: boolean) => {
      if (liveRef.current === next) return;
      liveRef.current = next;
      setLive(next);
      onChange(next);
      if (next && "vibrate" in navigator) navigator.vibrate?.(12);
    },
    [onChange],
  );

  useEffect(() => {
    const stop = () => set(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      if (canPublish && !disabled) set(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") stop();
    };

    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [set, canPublish, disabled]);

  if (!canPublish) {
    return (
      <div className="flex-1 rounded-2xl border border-[var(--line)] bg-[var(--card-2)] px-4 py-4 text-center text-sm text-[var(--ink-3)]">
        Listening only — raise a hand to ask for the mic
      </div>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-pressed={live}
      aria-label={live ? "On air — release to listen" : "Hold to talk"}
      className="flex-1 select-none touch-none rounded-2xl px-4 py-4 text-center transition-transform active:scale-[0.98] disabled:opacity-50"
      style={{
        background: live ? "var(--signal)" : "var(--amber)",
        color: live ? "#fff" : "var(--on-amber)",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        ref.current?.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
    >
      {live ? "On air — release to listen" : "Hold to talk"}
    </button>
  );
}
