import { guard, json, fail } from "@/lib/api";
import { adminUserActionSchema } from "@/lib/validation";
import { supabaseServer } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import type { Profile } from "@/types/database";

export const dynamic = "force-dynamic";

type ProfilePatch = Partial<
  Pick<Profile, "role" | "banned_at" | "suspended_until">
>;

/**
 * Account actions. Admin only, with a second factor this session — the
 * database trigger enforces both too (is_admin() is false below aal2), so a
 * missing check here fails closed rather than open.
 */
export async function POST(request: Request) {
  const g = await guard(
    request,
    adminUserActionSchema,
    { bucket: "admin.users", max: 120, windowS: 60, failClosed: true },
    { staff: "admin" },
  );
  if (!g.ok) return g.response;
  if (g.body.userId === g.user.id) {
    return fail(400, "You can't action your own account.");
  }

  const supabase = await supabaseServer();
  const now = new Date();
  const patch: ProfilePatch = {};

  switch (g.body.action) {
    case "suspend":
      patch.suspended_until = new Date(
        now.getTime() + (g.body.days ?? 7) * 864e5,
      ).toISOString();
      break;
    case "unsuspend":
      patch.suspended_until = null;
      break;
    case "ban":
      patch.banned_at = now.toISOString();
      break;
    case "unban":
      patch.banned_at = null;
      break;
    case "promote":
      patch.role = "moderator";
      break;
    case "demote":
      patch.role = "user";
      break;
  }

  const { data: updated, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", g.body.userId)
    .select("id");

  if (error) return fail(400, "Could not apply that.");
  if (!updated?.length) return fail(404, "No such account.");

  await audit({
    actorId: g.user.id,
    action: `admin.${g.body.action}`,
    targetType: "user",
    targetId: g.body.userId,
    metadata: { reason: g.body.reason, days: g.body.days ?? null },
  });

  return json({ ok: true });
}
