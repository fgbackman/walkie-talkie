import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { publicEnv } from "@/lib/env";
import { authCookieOptions } from "@/lib/session";

/**
 * Refreshes the Supabase session on every request and hands back the
 * response (with rotated cookies), the user, their assurance level, and the
 * client — so middleware can route, or sign out, without a second round trip.
 *
 * `extraHeaders` are forwarded to the app on the request (the CSP nonce).
 */
export async function updateSession(request: NextRequest, extraHeaders: Headers) {
  const forward = () => {
    const headers = new Headers(request.headers);
    extraHeaders.forEach((value, key) => headers.set(key, value));
    return NextResponse.next({ request: { headers } });
  };

  let response = forward();

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          for (const { name, value } of toSet) {
            request.cookies.set(name, value);
          }
          response = forward();
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

  const { data: aal } = user
    ? await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    : { data: null };

  // `response` is reassigned whenever cookies rotate, so read it late.
  return { response: () => response, user, aal, supabase };
}
