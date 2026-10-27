import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { closeRoom } from "@/lib/livekit";
import { audit } from "@/lib/audit";

/**
 * Permanently delete an account and everything it owns.
 *
 * Deleting the auth user cascades through profiles to walks, GPS points,
 * posts, comments, follows, reports filed, room seats and hosted rooms
 * (see 20261027000200_privacy_retention.sql). The audit trail keeps the
 * fact of the deletion with the account id, but no actor or personal data.
 *
 * Callers must have verified the session, a recent sign-in, and an explicit
 * confirmation. This never runs on a user id from the request body.
 */
export async function deleteAccount(userId: string): Promise<{ ok: boolean }> {
  const admin = supabaseAdmin();

  // Hosted rooms are about to disappear from the database; disconnect their
  // listeners from the media server too, or the audio carries on.
  const { data: rooms } = await admin
    .from("rooms")
    .select("livekit_room")
    .eq("host_id", userId)
    .eq("is_live", true);
  for (const r of rooms ?? []) {
    try {
      await closeRoom(r.livekit_room);
    } catch {
      /* already gone */
    }
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("account: delete failed", { code: error.code ?? error.status });
    return { ok: false };
  }

  // After the fact, and with no actor: the profile it would reference is gone.
  await audit({ actorId: null, action: "account.delete", targetType: "user", targetId: userId });
  return { ok: true };
}
