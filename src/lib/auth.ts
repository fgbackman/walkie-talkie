import "server-only";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export type SessionUser = { id: string; email: string | null; profile: Profile };

/** Returns the signed-in user and profile, or redirects to /login. */
export async function requireUser(next = "/"): Promise<SessionUser> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/auth/error?reason=no-profile");
  if (profile.banned_at) redirect("/auth/error?reason=banned");

  return { id: user.id, email: user.email ?? null, profile };
}

/** As requireUser, but also demands moderator or admin. */
export async function requireModerator(next = "/admin"): Promise<SessionUser> {
  const session = await requireUser(next);
  if (session.profile.role !== "admin" && session.profile.role !== "moderator") {
    redirect("/auth/error?reason=forbidden");
  }
  return session;
}

export async function requireAdmin(next = "/admin"): Promise<SessionUser> {
  const session = await requireUser(next);
  if (session.profile.role !== "admin") {
    redirect("/auth/error?reason=forbidden");
  }
  return session;
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.banned_at) return null;
  return { id: user.id, email: user.email ?? null, profile };
}
