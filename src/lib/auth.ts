import "server-only";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types/database";
import { latestAuthAt, RECENT_AUTH_S, STAFF_REVERIFY_S } from "@/lib/session";

export type SessionUser = { id: string; email: string | null; profile: Profile };

type Supabase = Awaited<ReturnType<typeof supabaseServer>>;

/**
 * Your own full profile row. Other users' rows expose public columns only
 * (column grants), so the private fields come through this RPC.
 */
async function loadOwnProfile(supabase: Supabase): Promise<Profile | null> {
  const { data } = await supabase.rpc("get_my_profile").maybeSingle();
  return (data as Profile | null) ?? null;
}

/** Returns the signed-in user and profile, or redirects to /login. */
export async function requireUser(next = "/"): Promise<SessionUser> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  const profile = await loadOwnProfile(supabase);

  if (!profile) redirect("/auth/error?reason=no-profile");
  if (profile.banned_at) redirect("/auth/error?reason=banned");

  return { id: user.id, email: user.email ?? null, profile };
}

function isStaffRole(role: UserRole, level: "moderator" | "admin") {
  return level === "admin" ? role === "admin" : role === "admin" || role === "moderator";
}

/**
 * Staff areas demand a second factor, always, entered within the last
 * STAFF_REVERIFY_S. No verified authenticator: go and enrol one. One
 * enrolled but not used recently: step up. The database agrees —
 * is_admin()/is_moderator() return false below aal2.
 */
async function requireStaff(level: "moderator" | "admin", next: string): Promise<SessionUser> {
  const session = await requireUser(next);
  if (!isStaffRole(session.profile.role, level)) {
    redirect("/auth/error?reason=forbidden");
  }

  const state = await staffFactorState();
  if (state === "no-factor") redirect("/settings/security?required=staff");
  if (state === "stale") redirect(`/auth/mfa?next=${encodeURIComponent(next)}`);
  return session;
}

/** Whether this session's second factor is good enough for staff work. */
async function staffFactorState(): Promise<"ok" | "stale" | "no-factor"> {
  const supabase = await supabaseServer();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    return aal?.nextLevel === "aal2" ? "stale" : "no-factor";
  }
  const totpAt = latestAuthAt(aal.currentAuthenticationMethods, "totp");
  const nowS = Math.floor(Date.now() / 1000);
  return totpAt !== null && nowS - totpAt <= STAFF_REVERIFY_S ? "ok" : "stale";
}

/**
 * For irreversible actions: did this session sign in, or pass a TOTP check,
 * within RECENT_AUTH_S? A stolen long-lived cookie alone is not enough.
 */
export async function hasRecentAuth(): Promise<boolean> {
  const supabase = await supabaseServer();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const at = latestAuthAt(aal?.currentAuthenticationMethods);
  return at !== null && Math.floor(Date.now() / 1000) - at <= RECENT_AUTH_S;
}

/** As requireUser, but also demands moderator or admin, with a second factor. */
export function requireModerator(next = "/admin"): Promise<SessionUser> {
  return requireStaff("moderator", next);
}

export function requireAdmin(next = "/admin"): Promise<SessionUser> {
  return requireStaff("admin", next);
}

/** True when a TOTP factor was used to establish this session. */
export async function hasAal2(): Promise<boolean> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === "aal2";
}

/**
 * For route handlers: returns the user or null, never redirects.
 * Route handlers answer with a status code, not a redirect.
 */
export async function getApiUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await loadOwnProfile(supabase);

  if (!profile || profile.banned_at) return null;
  return { id: user.id, email: user.email ?? null, profile };
}

/** For staff route handlers: role check plus a second factor this session. */
export async function apiStaffCheck(
  role: UserRole,
  level: "moderator" | "admin",
): Promise<{ ok: true } | { ok: false; status: 403; message: string }> {
  if (!isStaffRole(role, level)) {
    return { ok: false, status: 403, message: level === "admin" ? "Admin only." : "Staff only." };
  }
  const state = await staffFactorState();
  if (state !== "ok") {
    return {
      ok: false,
      status: 403,
      message:
        state === "no-factor"
          ? "Set up two-step verification first."
          : "Verify with your authenticator app first.",
    };
  }
  return { ok: true };
}
