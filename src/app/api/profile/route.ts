import { json, fail } from "@/lib/api";
import { getApiUser } from "@/lib/auth";
import { profileUpdateSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";
import { supabaseServer } from "@/lib/supabase/server";
import { ZodError } from "zod";
import type { Profile } from "@/types/database";

export const dynamic = "force-dynamic";

type SelfPatch = Partial<
  Pick<
    Profile,
    | "display_name"
    | "bio"
    | "interests"
    | "share_live_location"
    | "fuzz_endpoints"
    | "consent_recording"
    | "weekly_goal_m"
  >
>;

export async function PATCH(request: Request) {
  const user = await getApiUser();
  if (!user) return fail(401, "Sign in first.");

  const limited = await rateLimit(`profile:${user.id}`, 30, 60);
  if (!limited.ok) return fail(429, "Slow down a moment.");

  let body: ReturnType<typeof profileUpdateSchema.parse>;
  try {
    body = profileUpdateSchema.parse(await request.json());
  } catch (e) {
    if (e instanceof ZodError) return fail(422, "That didn't look right.");
    return fail(400, "Expected JSON.");
  }

  // Note what is NOT here: role, banned_at, suspended_until, handle.
  // Those are not user-editable, and the database trigger agrees.
  const patch: SelfPatch = {};
  if (body.displayName !== undefined) patch.display_name = body.displayName;
  if (body.bio !== undefined) patch.bio = body.bio;
  if (body.interests !== undefined) patch.interests = body.interests;
  if (body.shareLiveLocation !== undefined)
    patch.share_live_location = body.shareLiveLocation;
  if (body.fuzzEndpoints !== undefined) patch.fuzz_endpoints = body.fuzzEndpoints;
  if (body.consentRecording !== undefined)
    patch.consent_recording = body.consentRecording;
  if (body.weeklyGoalM !== undefined) patch.weekly_goal_m = body.weeklyGoalM;

  if (Object.keys(patch).length === 0) return json({ ok: true });

  const supabase = await supabaseServer();
  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) return fail(400, error.message);

  return json({ ok: true });
}
