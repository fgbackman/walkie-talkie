import { guard, json, fail } from "@/lib/api";
import { hasRecentAuth } from "@/lib/auth";
import { deleteAccountSchema } from "@/lib/validation";
import { deleteAccount } from "@/lib/account";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/account — permanently delete the signed-in account.
 *
 * Three gates: a valid session, a sign-in (or TOTP check) in the last 30
 * minutes, and the exact confirmation phrase in the body. A stolen session
 * cookie alone cannot erase someone's account.
 */
export async function DELETE(request: Request) {
  const g = await guard(request, deleteAccountSchema, {
    bucket: "account.delete",
    max: 3,
    windowS: 3600,
    failClosed: true,
  });
  if (!g.ok) return g.response;

  if (!(await hasRecentAuth())) {
    return fail(403, "Sign in again to delete your account.", { reauth: true });
  }

  const { ok } = await deleteAccount(g.user.id);
  if (!ok) return fail(500, "Your account was not deleted. Try again in a moment.");

  // The session belongs to a user that no longer exists; clear its cookies.
  const supabase = await supabaseServer();
  await supabase.auth.signOut({ scope: "local" });

  return json({ ok: true });
}
