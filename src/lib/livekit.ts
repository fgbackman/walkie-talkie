import "server-only";

import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * LiveKit tokens are minted here and nowhere else. The API secret never
 * leaves the server, the grant is scoped to one room, and `canPublish` is
 * decided from the database row — not from anything the client sent.
 */
export async function mintRoomToken(opts: {
  roomName: string;
  identity: string;
  name: string;
  canPublish: boolean;
  canPublishData?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = serverEnv();

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: opts.identity,
    name: opts.name,
    // Short-lived. A walk is long, but the client refreshes.
    ttl: "2h",
    metadata: JSON.stringify(opts.metadata ?? {}),
  });

  at.addGrant({
    room: opts.roomName,
    roomJoin: true,
    canPublish: opts.canPublish,
    canSubscribe: true,
    canPublishData: opts.canPublishData ?? true,
    // Nobody gets room-admin from a user token.
    roomAdmin: false,
    roomCreate: false,
    canUpdateOwnMetadata: true,
  });

  return at.toJwt();
}

function httpUrl() {
  return publicEnv.NEXT_PUBLIC_LIVEKIT_URL.replace(/^wss:/, "https:").replace(
    /^ws:/,
    "http:",
  );
}

export function roomService() {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = serverEnv();
  return new RoomServiceClient(httpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

/** Server-side mute — used by host controls and the admin console. */
export async function forceMute(roomName: string, identity: string) {
  const svc = roomService();
  const participants = await svc.listParticipants(roomName);
  const p = participants.find((x) => x.identity === identity);
  if (!p) return;
  for (const track of p.tracks) {
    if (track.type === 1 /* AUDIO */) {
      await svc.mutePublishedTrack(roomName, identity, track.sid, true);
    }
  }
}

export async function removeParticipant(roomName: string, identity: string) {
  await roomService().removeParticipant(roomName, identity);
}

export async function closeRoom(roomName: string) {
  await roomService().deleteRoom(roomName);
}
