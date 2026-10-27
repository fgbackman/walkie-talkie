import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildCsp, createNonce } from "@/lib/csp";
import { isIdle, SEEN_COOKIE, SEEN_REFRESH_S, SESSION_COOKIE_MAX_AGE_S } from "@/lib/session";

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

const under = (pathname: string, p: string) => pathname === p || pathname.startsWith(p + "/");

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = under(pathname, "/api");

  const nonce = createNonce();
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV !== "production" });
  const forwarded = new Headers({ "x-nonce": nonce, "content-security-policy": csp });

  const send = <R extends NextResponse>(res: R): R => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  if (PUBLIC_PATHS.some((p) => under(pathname, p))) {
    const headers = new Headers(request.headers);
    forwarded.forEach((v, k) => headers.set(k, v));
    return send(NextResponse.next({ request: { headers } }));
  }

  const session = await updateSession(request, forwarded);
  const { user, aal, supabase } = session;

  /** Redirect, or answer JSON for API calls, keeping any rotated auth cookies. */
  const deny = (status: 401 | 403, message: string, to: string, params: Record<string, string>) => {
    let res: NextResponse;
    if (isApi) {
      res = NextResponse.json({ error: message }, { status });
    } else {
      const url = request.nextUrl.clone();
      url.pathname = to;
      url.search = "";
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      res = NextResponse.redirect(url);
    }
    for (const c of session.response().cookies.getAll()) res.cookies.set(c);
    return send(res);
  };

  if (!user) {
    const res = deny(401, "Sign in first.", "/login", { next: pathname });
    res.cookies.delete(SEEN_COOKIE);
    return res;
  }

  // Inactivity timeout: no request for IDLE_TIMEOUT_S signs the session out.
  const nowS = Math.floor(Date.now() / 1000);
  const seenRaw = Number(request.cookies.get(SEEN_COOKIE)?.value);
  const seen = Number.isFinite(seenRaw) && seenRaw > 0 ? seenRaw : null;

  if (isIdle(seen, nowS)) {
    await supabase.auth.signOut({ scope: "local" });
    const res = deny(401, "Signed out after a period of inactivity.", "/login", {
      next: pathname,
      reason: "idle",
    });
    res.cookies.delete(SEEN_COOKIE);
    return res;
  }

  // If the account has a verified TOTP factor, the session must have used it.
  const needsStepUp = aal?.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel;
  const wantsAal2 = AAL2_PATHS.some((p) => under(pathname, p));

  if (needsStepUp && (wantsAal2 || pathname !== "/auth/mfa")) {
    return deny(403, "Verify with your authenticator app first.", "/auth/mfa", { next: pathname });
  }

  const response = send(session.response());
  if (seen === null || nowS - seen >= SEEN_REFRESH_S) {
    response.cookies.set(SEEN_COOKIE, String(nowS), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      // Must outlive the idle window, or an idle session would come back
      // with no cookie and look brand new.
      maxAge: SESSION_COOKIE_MAX_AGE_S,
    });
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
