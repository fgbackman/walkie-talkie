"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  acceptPoint,
  elevationGain,
  formatDuration,
  formatPace,
  paceSecPerKm,
  pathFrom,
  splits as computeSplits,
  totalDistance,
  toViewBox,
  type Point,
} from "@/lib/geo";

type Recent = {
  id: string;
  title: string;
  distance_m: number;
  duration_s: number;
  started_at: string;
};

type Phase = "idle" | "requesting" | "tracking" | "paused" | "finishing" | "done";

const FLUSH_MS = 8000;

export default function WalkClient({
  recent,
  activeRoom,
  defaultVisibility,
}: {
  recent: Recent[];
  activeRoom: { id: string; title: string; listener_count: number } | null;
  defaultVisibility: "private" | "followers" | "public";
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [walkId, setWalkId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ distance: number; duration: number } | null>(null);

  const watchId = useRef<number | null>(null);
  const unsent = useRef<Point[]>([]);
  const startedAt = useRef<number>(0);
  const pausedFor = useRef<number>(0);
  const pauseStart = useRef<number | null>(null);
  const lastPoint = useRef<Point | null>(null);

  const distance = totalDistance(points);
  const pace = paceSecPerKm(distance, elapsed);
  const gain = elevationGain(points);
  const liveSplits = computeSplits(points);

  /* --------------------------------------------------------------- timer */
  useEffect(() => {
    if (phase !== "tracking") return;
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current - pausedFor.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  /* ---------------------------------------------------------- flush loop */
  const flush = useCallback(async () => {
    if (!walkId || unsent.current.length === 0) return;
    const batch = unsent.current.splice(0, 240);
    try {
      await fetch(`/api/walks/${walkId}/points`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walkId,
          points: batch.map((p) => ({
            t: new Date(p.t).toISOString(),
            lat: p.lat,
            lng: p.lng,
            accuracy: p.accuracy ?? null,
            altitude: p.altitude ?? null,
            speed: p.speed ?? null,
          })),
        }),
      });
    } catch {
      // Offline: put them back and try on the next tick. The track survives
      // a tunnel.
      unsent.current.unshift(...batch);
    }
  }, [walkId]);

  useEffect(() => {
    if (phase !== "tracking") return;
    const t = setInterval(() => void flush(), FLUSH_MS);
    return () => clearInterval(t);
  }, [phase, flush]);

  /* --------------------------------------------------------------- start */
  async function start() {
    setError(null);
    if (!("geolocation" in navigator)) {
      return setError("This device has no location services.");
    }
    setPhase("requesting");

    try {
      const res = await fetch("/api/walks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: activeRoom?.id ?? null,
          title: "",
          visibility: defaultVisibility,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not start.");
      setWalkId(body.walk.id);
    } catch (e) {
      setPhase("idle");
      return setError(e instanceof Error ? e.message : "Could not start.");
    }

    startedAt.current = Date.now();
    pausedFor.current = 0;
    setPoints([]);
    setElapsed(0);
    lastPoint.current = null;
    unsent.current = [];

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p: Point = {
          t: pos.timestamp,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          speed: pos.coords.speed,
        };
        if (!acceptPoint(lastPoint.current, p)) return;
        lastPoint.current = p;
        unsent.current.push(p);
        setPoints((prev) => [...prev, p]);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location is blocked. Allow it in your browser settings to record a route."
            : "Lost the GPS signal.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );

    setPhase("tracking");
  }

  function pause() {
    pauseStart.current = Date.now();
    setPhase("paused");
  }

  function resume() {
    if (pauseStart.current) pausedFor.current += Date.now() - pauseStart.current;
    pauseStart.current = null;
    setPhase("tracking");
  }

  async function finish() {
    setPhase("finishing");
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;

    await flush();

    if (!walkId) return setPhase("idle");

    const res = await fetch(`/api/walks/${walkId}/finish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ walkId, splits: liveSplits }),
    });
    const body = await res.json().catch(() => ({}));

    setSummary({
      distance: body?.walk?.distance_m ?? Math.round(distance),
      duration: body?.walk?.duration_s ?? elapsed,
    });
    setPhase("done");
  }

  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  /* -------------------------------------------------------------- render */
  const track = toViewBox(points, 360, 240);
  const d = pathFrom(track);
  const head = track[track.length - 1];

  if (phase === "done" && summary) {
    return (
      <main className="px-4 pb-10 pt-6">
        <div className="wt-label text-[var(--amber)]">Walk complete</div>
        <h1
          className="mb-1 mt-1 text-[32px] leading-none tracking-tight"
          style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}
        >
          {summary.distance >= 3000 ? "Good one." : "Short and sweet."}
        </h1>
        <p className="mb-5 text-sm text-[var(--ink-3)]">
          {activeRoom ? `With ${activeRoom.title}` : "Walked solo"}
        </p>

        <div className="mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)]">
          <Stat label="Distance" value={`${(summary.distance / 1000).toFixed(2)}`} unit="km" />
          <Stat label="Time" value={formatDuration(summary.duration)} />
          <Stat
            label="Avg pace"
            value={formatPace(paceSecPerKm(summary.distance, summary.duration))}
            unit="/km"
          />
        </div>

        <button className="wt-btn wt-btn-ghost" onClick={() => { setPhase("idle"); setSummary(null); }}>
          Done
        </button>
      </main>
    );
  }

  return (
    <main className="pb-8">
      <div className="relative h-60 border-b border-[var(--line)] bg-[var(--card-2)]">
        <svg viewBox="0 0 360 240" className="h-full w-full" aria-label="Your route">
          <rect width="360" height="240" fill="var(--card-2)" />
          {d && (
            <>
              <path
                d={d}
                fill="none"
                stroke="var(--amber)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {track[0] && <circle cx={track[0].x} cy={track[0].y} r="5" fill="var(--teal)" />}
              {head && <circle cx={head.x} cy={head.y} r="6" fill="var(--amber)" stroke="var(--paper)" strokeWidth="3" />}
            </>
          )}
        </svg>
        <div
          className="wt-label absolute left-3 top-3 rounded-lg border border-[var(--line)] bg-[var(--card)] px-2 py-1"
        >
          {phase === "tracking"
            ? `Recording · ${points.length} fixes`
            : phase === "paused"
              ? "Paused"
              : "Ready"}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-[var(--line)]">
        <Stat label="Distance" value={(distance / 1000).toFixed(2)} unit="km" big />
        <Stat label="Time" value={formatDuration(elapsed)} big />
        <Stat label="Pace" value={formatPace(pace)} unit="/km" big />
      </div>
      <div className="grid grid-cols-3 gap-px border-b border-[var(--line)] bg-[var(--line)]">
        <Stat label="Steps" value={String(Math.round((distance / 1000) * 1372))} />
        <Stat label="Elev gain" value={`${Math.round(gain)} m`} />
        <Stat label="Splits" value={String(liveSplits.length)} />
      </div>

      {activeRoom && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-[var(--chassis)] px-3 py-3 text-[var(--on-chassis)]">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{activeRoom.title}</p>
            <p className="truncate text-xs opacity-70">
              {activeRoom.listener_count} listening · you’re in this room
            </p>
          </div>
          <Link
            href={`/rooms/${activeRoom.id}`}
            className="shrink-0 rounded-lg bg-[var(--amber)] px-3 py-2 text-xs font-bold text-[var(--on-amber)]"
          >
            Open
          </Link>
        </div>
      )}

      <div className="flex gap-2.5 px-4 py-4">
        {phase === "idle" || phase === "requesting" ? (
          <button className="wt-btn wt-btn-amber" onClick={start} disabled={phase === "requesting"}>
            {phase === "requesting" ? "Starting…" : "Start walk"}
          </button>
        ) : (
          <>
            <button
              className="wt-btn wt-btn-ghost"
              onClick={phase === "paused" ? resume : pause}
              disabled={phase === "finishing"}
            >
              {phase === "paused" ? "Resume" : "Pause"}
            </button>
            <button className="wt-btn wt-btn-red" onClick={finish} disabled={phase === "finishing"}>
              {phase === "finishing" ? "Saving…" : "Finish"}
            </button>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mx-4 rounded-xl bg-[var(--signal-ghost)] p-3 text-sm text-[var(--signal)]">
          {error}
        </p>
      )}

      {liveSplits.length > 0 && (
        <section className="px-4 pt-2">
          <div className="wt-label mb-2">Splits</div>
          <ul className="flex flex-col gap-1.5">
            {liveSplits.map((s) => (
              <li key={s.km} className="wt-mono flex items-center gap-3 text-xs">
                <span className="w-9 text-[var(--ink-3)]">KM {s.km}</span>
                <span
                  className="h-2 rounded bg-[var(--teal)]"
                  style={{ width: `${Math.max(10, 100 - s.durationS / 20)}%` }}
                />
                <span className="ml-auto">{formatDuration(s.durationS)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {phase === "idle" && recent.length > 0 && (
        <section className="px-4 pt-5">
          <div className="wt-label mb-2">Recent</div>
          <ul className="wt-card divide-y divide-[var(--line-2)]">
            {recent.map((w) => (
              <li key={w.id} className="flex items-center gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {w.title || "Walk"}
                  </p>
                  <p className="wt-mono text-[11px] text-[var(--ink-3)]">
                    {(w.distance_m / 1000).toFixed(2)} km · {formatDuration(w.duration_s)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  unit,
  big,
}: {
  label: string;
  value: string;
  unit?: string;
  big?: boolean;
}) {
  return (
    <div className="bg-[var(--paper)] px-4 py-3">
      <div className="wt-label text-[9px]">{label}</div>
      <div
        className="wt-mono tracking-tight"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: big ? 29 : 17,
          lineHeight: 1.15,
        }}
      >
        {value}
        {unit && (
          <span className="ml-0.5 text-sm font-semibold text-[var(--ink-3)]">{unit}</span>
        )}
      </div>
    </div>
  );
}
