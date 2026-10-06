"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client";
import PushToTalk from "@/components/PushToTalk";
import Avatar from "@/components/Avatar";
import { supabaseBrowser } from "@/lib/supabase/client";

type RoomInfo = {
  id: string;
  title: string;
  description: string;
  type: string;
  isLive: boolean;
  hostId: string;
  hostName: string;
  targetPace: number | null;
};

type Me = { id: string; name: string; avatar: string | null };

type Participant = {
  user_id: string;
  role: string;
  hand_raised: boolean;
  is_walking: boolean;
  muted_by_host: boolean;
  profile?: { display_name: string; handle: string; avatar_url: string | null };
};

type Status = "idle" | "joining" | "connected" | "error" | "ended";

export default function RoomClient({ room, me }: { room: RoomInfo; me: Me }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [handRaised, setHandRaised] = useState(false);

  const lkRef = useRef<Room | null>(null);
  const audioHost = useRef<HTMLDivElement>(null);

  const isHost = room.hostId === me.id;

  /* ---------------------------------------------------------------- join */
  const join = useCallback(async () => {
    setStatus("joining");
    setError(null);
    try {
      // 1. Claim a seat in Postgres (RLS checks we're allowed).
      const joinRes = await fetch(`/api/rooms/${room.id}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!joinRes.ok) throw new Error((await joinRes.json()).error ?? "Could not join.");

      // 2. Ask the server for a token. Publish rights are decided there.
      const tokenRes = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: room.id }),
      });
      if (!tokenRes.ok) throw new Error((await tokenRes.json()).error ?? "No token.");
      const { token, url, canPublish: pub } = await tokenRes.json();
      setCanPublish(Boolean(pub));

      // 3. Connect.
      const lk = new Room({
        adaptiveStream: true,
        dynacast: true,
        // Voice, not music: aggressive processing is the right call here.
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      lkRef.current = lk;

      lk.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach() as HTMLAudioElement;
        el.dataset.identity = participant.identity;
        el.autoplay = true;
        audioHost.current?.appendChild(el);
      });

      lk.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
      });

      lk.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setSpeaking(new Set(speakers.map((s) => s.identity)));
      });

      lk.on(RoomEvent.Disconnected, () => setStatus("ended"));

      await lk.connect(url, token);
      // Start muted, always. Nobody is broadcast into a room by surprise.
      await lk.localParticipant.setMicrophoneEnabled(false);
      setStatus("connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect.");
      setStatus("error");
    }
  }, [room.id]);

  /* -------------------------------------------------------------- leave */
  const leave = useCallback(async () => {
    try {
      await lkRef.current?.disconnect();
    } finally {
      lkRef.current = null;
      await fetch(`/api/rooms/${room.id}/leave`, { method: "POST" });
      router.push("/");
      router.refresh();
    }
  }, [room.id, router]);

  useEffect(() => {
    return () => {
      // Disconnect, and tell the server, if the tab goes away mid-room.
      const lk = lkRef.current;
      if (lk) {
        void lk.disconnect();
        navigator.sendBeacon?.(`/api/rooms/${room.id}/leave`);
      }
    };
  }, [room.id]);

  /* ------------------------------------------------- participant stream */
  useEffect(() => {
    const supabase = supabaseBrowser();
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("room_participants")
        .select("user_id,role,hand_raised,is_walking,muted_by_host")
        .eq("room_id", room.id)
        .is("left_at", null);

      if (!active || !data) return;

      const ids = data.map((d) => d.user_id);
      const { data: profiles } = ids.length
        ? await supabase
            .from("profiles")
            .select("id,display_name,handle,avatar_url")
            .in("id", ids)
        : { data: [] };

      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      if (!active) return;
      setParticipants(
        data.map((d) => ({ ...d, profile: byId.get(d.user_id) ?? undefined })),
      );
      const mine = data.find((d) => d.user_id === me.id);
      if (mine) setHandRaised(mine.hand_raised);
    }

    void load();

    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_participants", filter: `room_id=eq.${room.id}` },
        () => void load(),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [room.id, me.id]);

  /* ------------------------------------------------------------ push-to-talk */
  const onTalk = useCallback(
    (live: boolean) => {
      const lk = lkRef.current;
      if (!lk) return;
      void lk.localParticipant.setMicrophoneEnabled(live).catch(() => {
        setError("Microphone blocked. Check the site permissions.");
      });
    },
    [],
  );

  async function toggleHand() {
    const next = !handRaised;
    setHandRaised(next);
    await supabaseBrowser()
      .from("room_participants")
      .update({ hand_raised: next })
      .eq("room_id", room.id)
      .eq("user_id", me.id);
  }

  async function hostAction(targetUserId: string, action: string) {
    await fetch(`/api/rooms/${room.id}/host`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId: room.id, targetUserId, action }),
    });
  }

  const stage = useMemo(
    () => participants.filter((p) => p.role !== "listener"),
    [participants],
  );
  const audience = useMemo(
    () => participants.filter((p) => p.role === "listener"),
    [participants],
  );

  /* ------------------------------------------------------------- render */
  if (status === "idle" || status === "joining" || status === "error") {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-5">
        <div className="wt-label mb-3">{room.type} channel</div>
        <h1
          className="mb-2 text-3xl tracking-tight"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          {room.title}
        </h1>
        <p className="mb-6 text-sm text-[var(--ink-2)]">
          {room.description || `Hosted by ${room.hostName}.`}
        </p>
        <p className="mb-6 rounded-xl bg-[var(--card-2)] p-3 text-xs text-[var(--ink-3)]">
          You join muted. Your microphone only opens while you hold the talk
          bar, and nobody can turn it on for you.
        </p>
        <button
          className="wt-btn wt-btn-amber"
          onClick={join}
          disabled={status === "joining"}
        >
          {status === "joining" ? "Connecting…" : "Join channel"}
        </button>
        {error && (
          <p role="alert" className="mt-4 text-sm text-[var(--signal)]">
            {error}
          </p>
        )}
      </main>
    );
  }

  if (status === "ended") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-5 text-center">
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700 }} className="text-2xl">
          Channel closed
        </h1>
        <button className="wt-btn" onClick={() => router.push("/")}>
          Back to channels
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <div ref={audioHost} className="sr-only" aria-hidden="true" />

      <header className="border-b border-[var(--line)] px-4 pb-3 pt-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="wt-live">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            ON AIR
          </span>
          <span className="wt-mono ml-auto text-[11.5px] text-[var(--ink-3)]">
            {participants.length} here
          </span>
        </div>
        <h1
          className="text-xl tracking-tight"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          {room.title}
        </h1>
        <p className="mt-1 text-xs text-[var(--ink-3)]">
          Hosted by {room.hostName}
          {room.targetPace ? ` · target ${room.targetPace} km/h` : ""}
        </p>
      </header>

      <section className="px-4 py-4">
        <div className="wt-label mb-3">On stage</div>
        <ul className="grid grid-cols-4 gap-3">
          {stage.map((p) => (
            <li key={p.user_id} className="flex flex-col items-center gap-1.5 text-center">
              <span
                className="grid place-items-center rounded-full p-0.5 transition-shadow"
                style={{
                  boxShadow: speaking.has(p.user_id)
                    ? "0 0 0 3px var(--teal)"
                    : "0 0 0 0 transparent",
                }}
              >
                <Avatar
                  name={p.profile?.display_name ?? "?"}
                  src={p.profile?.avatar_url}
                  id={p.user_id}
                  size={52}
                />
              </span>
              <span className="text-[11.5px] font-semibold leading-tight">
                {(p.profile?.display_name ?? "Someone").split(" ")[0]}
              </span>
              <span className="wt-label text-[9px]">{p.role}</span>
              {isHost && p.user_id !== me.id && (
                <button
                  className="text-[10px] text-[var(--signal)] underline"
                  onClick={() => hostAction(p.user_id, "demote")}
                >
                  mute
                </button>
              )}
            </li>
          ))}
        </ul>

        {audience.length > 0 && (
          <>
            <div className="wt-label mb-2 mt-5">Listening · {audience.length}</div>
            <ul className="grid grid-cols-6 gap-2">
              {audience.slice(0, 18).map((p) => (
                <li key={p.user_id} className="flex flex-col items-center gap-1">
                  <span className="relative">
                    <Avatar
                      name={p.profile?.display_name ?? "?"}
                      src={p.profile?.avatar_url}
                      id={p.user_id}
                      size={34}
                    />
                    {p.hand_raised && (
                      <span
                        className="absolute -right-1 -top-1 text-[11px]"
                        title="Hand raised"
                      >
                        ✋
                      </span>
                    )}
                  </span>
                  {isHost && p.hand_raised && (
                    <button
                      className="text-[9px] text-[var(--teal)] underline"
                      onClick={() => hostAction(p.user_id, "promote")}
                    >
                      let in
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="mt-auto border-t border-[var(--line)] bg-[var(--card-2)] px-4 pb-5 pt-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={toggleHand}
            aria-pressed={handRaised}
            aria-label="Raise hand"
            className="grid h-13 w-13 shrink-0 place-items-center rounded-full border text-xl"
            style={{
              height: 52,
              width: 52,
              borderColor: handRaised ? "var(--amber)" : "var(--line)",
              background: handRaised ? "var(--amber-ghost)" : "var(--card)",
            }}
          >
            ✋
          </button>
          <PushToTalk canPublish={canPublish} onChange={onTalk} />
          <button
            onClick={leave}
            aria-label="Leave quietly"
            className="grid shrink-0 place-items-center rounded-full"
            style={{
              height: 52,
              width: 52,
              background: "var(--signal-ghost)",
              color: "var(--signal)",
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-center text-xs text-[var(--signal)]">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
