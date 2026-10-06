import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/auth/error",
  "/legal",
  "/_next",
  "/favicon.ico",
];

/** Routes that demand a second factor was actually used this session. */
const AAL2_PATHS = ["/admin", "/settings/security"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const { response, user, aal } = await updateSession(request);

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // If the account has a verified TOTP factor, the session must have used it.
  const needsStepUp =
    aal?.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel;

  const wantsAal2 = AAL2_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (needsStepUp && (wantsAal2 || pathname !== "/auth/mfa")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/mfa";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
