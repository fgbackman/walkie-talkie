"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { publicEnv } from "@/lib/env";

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Browser client. Holds the anon key only — RLS does the rest. */
export function supabaseBrowser() {
  cached ??= createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return cached;
}
