import "server-only";

import { NextResponse } from "next/server";
import { ZodError, type TypeOf, type ZodTypeAny } from "zod";
import { apiStaffCheck, getApiUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export type ApiUser = NonNullable<Awaited<ReturnType<typeof getApiUser>>>;

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Every mutating route goes through this: authenticate, (for staff routes)
 * check role and second factor, rate limit, parse.
 * Returning early with a typed failure keeps the handlers short enough to
 * audit at a glance.
 *
 * Generic over the schema (not its output) so zod defaults are reflected —
 * a field with `.default([])` is non-optional on the parsed body.
 */
export async function guard<S extends ZodTypeAny>(
  request: Request,
  schema: S,
  limit: { bucket: string; max: number; windowS: number },
  options: { staff?: "moderator" | "admin" } = {},
): Promise<
  | { ok: true; user: ApiUser; body: TypeOf<S> }
  | { ok: false; response: NextResponse }
> {
  const user = await getApiUser();
  if (!user) return { ok: false, response: fail(401, "Sign in first.") };

  if (options.staff) {
    const staff = await apiStaffCheck(user.profile.role, options.staff);
    if (!staff.ok) return { ok: false, response: fail(staff.status, staff.message) };
  }

  const ip = clientIp(request.headers);
  const byUser = await rateLimit(`${limit.bucket}:u:${user.id}`, limit.max, limit.windowS);
  const byIp = await rateLimit(`${limit.bucket}:i:${ip}`, limit.max * 3, limit.windowS);

  if (!byUser.ok || !byIp.ok) {
    const retry = (!byUser.ok ? byUser.retryAfter : 0) || (!byIp.ok ? byIp.retryAfter : 0);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Slow down a moment." },
        { status: 429, headers: { "Retry-After": String(retry) } },
      ),
    };
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: fail(400, "Expected JSON.") };
  }

  try {
    return { ok: true, user, body: schema.parse(raw) as TypeOf<S> };
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        ok: false,
        response: fail(422, "That didn't look right.", {
          issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        }),
      };
    }
    return { ok: false, response: fail(400, "Bad request.") };
  }
}
