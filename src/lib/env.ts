import { z } from "zod";

/**
 * Environment is validated once, at module load, and fails loudly.
 * A missing LiveKit secret should break the build, not surface as a
 * confusing 500 the first time someone tries to talk.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_LIVEKIT_URL: z.string().startsWith("wss://"),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

// Referenced by their full names so Next can statically inline them.
export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL,
  NEXT_PUBLIC_SITE_URL:
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  LIVEKIT_API_KEY: z.string().min(3),
  LIVEKIT_API_SECRET: z.string().min(10),
});

/**
 * Server-only. Calling this from a client component throws at build time
 * because `process.env.SUPABASE_SERVICE_ROLE_KEY` is undefined in the
 * browser bundle and the schema rejects it.
 */
export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() was called in the browser. This is a bug.");
  }
  return serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
  });
}
