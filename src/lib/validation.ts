import { z } from "zod";

/**
 * One schema per mutating endpoint. Nothing reaches the database without
 * passing through here first — length caps, enum membership, coordinate
 * ranges. The DB has matching CHECK constraints as the backstop.
 */

export const handleSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]{2,29}$/, "3–30 chars, lowercase, . _ - allowed");

export const createRoomSchema = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(500).default(""),
  type: z.enum(["open", "squad", "guided", "ambient"]).default("open"),
  topics: z.array(z.string().trim().min(1).max(24)).max(6).default([]),
  targetPaceKmh: z.number().min(1).max(20).nullable().default(null),
  goLiveOnWalk: z.boolean().default(false),
  recordingEnabled: z.boolean().default(false),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const joinRoomSchema = z.object({
  roomId: z.string().uuid(),
});

export const roomTokenSchema = z.object({
  roomId: z.string().uuid(),
});

export const hostActionSchema = z.object({
  roomId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  action: z.enum(["mute", "unmute", "promote", "demote", "remove"]),
});

export const startWalkSchema = z.object({
  roomId: z.string().uuid().nullable().default(null),
  title: z.string().trim().max(120).default(""),
  visibility: z.enum(["private", "followers", "public"]).default("followers"),
});

export const walkPointSchema = z.object({
  t: z.string().datetime(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(10000).nullable().default(null),
  altitude: z.number().min(-500).max(9000).nullable().default(null),
  speed: z.number().min(0).max(30).nullable().default(null),
});

export const walkPointsSchema = z.object({
  walkId: z.string().uuid(),
  // Batched by the client every few seconds; cap the batch so one request
  // cannot insert a million rows.
  points: z.array(walkPointSchema).min(1).max(240),
});

export const finishWalkSchema = z.object({
  walkId: z.string().uuid(),
  splits: z
    .array(z.object({ km: z.number().int().min(1).max(500), durationS: z.number().int().min(1) }))
    .max(500)
    .default([]),
});

export const createPostSchema = z.object({
  kind: z.enum(["walk", "clip", "text", "challenge", "room"]).default("text"),
  body: z.string().trim().min(1).max(2000),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).default([]),
  walkId: z.string().uuid().nullable().default(null),
});

export const reportSchema = z.object({
  targetType: z.enum(["user", "room", "post", "comment"]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(2).max(60),
  details: z.string().trim().max(1000).default(""),
});

export const adminUserActionSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["suspend", "unsuspend", "ban", "unban", "promote", "demote"]),
  days: z.number().int().min(1).max(365).optional(),
  reason: z.string().trim().max(500).default(""),
});

export const adminRoomActionSchema = z.object({
  roomId: z.string().uuid(),
  action: z.enum(["close", "disable_recording"]),
  reason: z.string().trim().max(500).default(""),
});

export const resolveReportSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(["actioned", "dismissed"]),
  resolution: z.string().trim().max(500).default(""),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().max(60).optional(),
  bio: z.string().trim().max(280).optional(),
  interests: z.array(z.string().trim().min(1).max(24)).max(12).optional(),
  shareLiveLocation: z.boolean().optional(),
  fuzzEndpoints: z.boolean().optional(),
  consentRecording: z.boolean().optional(),
  weeklyGoalM: z.number().int().min(0).max(1000000).optional(),
});
