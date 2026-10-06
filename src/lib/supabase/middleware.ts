import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { publicEnv } from "@/lib/env";

/**
 * Refreshes the Supabase session on every request and hands back both the
 * response (with rotated cookies) and the user, so the middleware can make
 * routing decisions without a second round trip.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          for (const { name, value } of toSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the JWT with the auth server. getSession() does not
  // and must never be trusted for an authorisation decision.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  return { response, user, aal };
}
