import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env";

/**
 * SERVICE ROLE CLIENT — bypasses Row Level Security entirely.
 *
 * Rules for touching this file:
 *   1. Never import it from a "use client" module.
 *   2. Never return raw rows from it to a client without filtering.
 *   3. Every call site must have already checked authorisation itself.
 *
 * It exists for exactly three jobs: minting LiveKit tokens, the admin
 * console, and the rate limiter.
 */
export function supabaseAdmin() {
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin() reached the browser. This is a bug.");
  }
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv();

  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "x-app-role": "service" } },
    },
  );
}
