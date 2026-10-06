/**
 * Hand-maintained until the first `npm run db:types` against a live project.
 * Keep it in step with supabase/migrations.
 */

export type UserRole = "user" | "moderator" | "admin";
export type RoomType = "open" | "squad" | "guided" | "ambient";
export type ParticipantRole = "host" | "cohost" | "speaker" | "listener";
export type WalkVisibility = "private" | "followers" | "public";
export type PostKind = "walk" | "clip" | "text" | "challenge" | "room";
export type ReportStatus = "open" | "actioned" | "dismissed";
export type ReportTarget = "user" | "room" | "post" | "comment";

export type Profile = {
  id: string;
  handle: string;
  callsign: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  role: UserRole;
  interests: string[];
  share_live_location: boolean;
  fuzz_endpoints: boolean;
  consent_recording: boolean;
  weekly_goal_m: number;
  suspended_until: string | null;
  banned_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Room = {
  id: string;
  title: string;
  description: string;
  host_id: string;
  type: RoomType;
  topics: string[];
  target_pace_kmh: number | null;
  livekit_room: string;
  is_live: boolean;
  recording_enabled: boolean;
  max_participants: number;
  listener_count: number;
  walking_count: number;
  started_at: string;
  ended_at: string | null;
  closed_by: string | null;
  close_reason: string | null;
  created_at: string;
};

export type RoomParticipant = {
  room_id: string;
  user_id: string;
  role: ParticipantRole;
  hand_raised: boolean;
  is_walking: boolean;
  muted_by_host: boolean;
  joined_at: string;
  left_at: string | null;
};

export type Walk = {
  id: string;
  user_id: string;
  room_id: string | null;
  title: string;
  started_at: string;
  ended_at: string | null;
  distance_m: number;
  duration_s: number;
  elevation_gain_m: number;
  steps: number;
  avg_pace_s_per_km: number | null;
  on_air_s: number;
  visibility: WalkVisibility;
  created_at: string;
};

export type WalkPoint = {
  id: number;
  walk_id: string;
  t: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  altitude_m: number | null;
  speed_mps: number | null;
};

export type WalkSplit = { walk_id: string; km: number; duration_s: number };

/** What the API actually inserts: no id, nullable sensor fields explicit. */
export type WalkPointInsert = {
  walk_id: string;
  t: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  altitude_m: number | null;
  speed_mps: number | null;
};

export type Post = {
  id: string;
  author_id: string;
  kind: PostKind;
  body: string;
  tags: string[];
  walk_id: string | null;
  room_id: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type Report = {
  id: string;
  reporter_id: string;
  target_type: ReportTarget;
  target_id: string;
  reason: string;
  details: string;
  status: ReportStatus;
  handled_by: string | null;
  handled_at: string | null;
  resolution: string | null;
  created_at: string;
};

export type AuditEntry = {
  id: number;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      rooms: Table<Room>;
      room_participants: Table<RoomParticipant>;
      walks: Table<Walk>;
      walk_points: Table<WalkPoint, WalkPointInsert>;
      walk_splits: Table<WalkSplit>;
      posts: Table<Post>;
      comments: Table<{
        id: string;
        post_id: string;
        author_id: string;
        body: string;
        created_at: string;
        deleted_at: string | null;
      }>;
      post_reactions: Table<{ post_id: string; user_id: string; kind: string }>;
      follows: Table<{ follower_id: string; followee_id: string; created_at: string }>;
      blocks: Table<{ blocker_id: string; blocked_id: string; created_at: string }>;
      reports: Table<Report>;
      audit_log: Table<AuditEntry>;
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: { Args: { uid?: string }; Returns: boolean };
      is_moderator: { Args: { uid?: string }; Returns: boolean };
      is_active: { Args: { uid?: string }; Returns: boolean };
      in_room: { Args: { rid: string; uid?: string }; Returns: boolean };
      room_can_record: { Args: { rid: string }; Returns: boolean };
      finalize_walk: { Args: { p_walk_id: string }; Returns: Walk };
      consume_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_s: number };
        Returns: boolean;
      };
      log_audit: {
        Args: {
          p_action: string;
          p_target_type?: string;
          p_target_id?: string;
          p_metadata?: Record<string, unknown>;
        };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      room_type: RoomType;
      participant_role: ParticipantRole;
      walk_visibility: WalkVisibility;
      post_kind: PostKind;
      report_status: ReportStatus;
      report_target: ReportTarget;
    };
    CompositeTypes: Record<never, never>;
  };
};
