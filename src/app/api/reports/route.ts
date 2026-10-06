import { guard, json, fail } from "@/lib/api";
import { reportSchema } from "@/lib/validation";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** User-facing: report a person, room, post or comment. */
export async function POST(request: Request) {
  const g = await guard(request, reportSchema, {
    bucket: "report.create",
    max: 10,
    windowS: 600,
  });
  if (!g.ok) return g.response;

  const supabase = await supabaseServer();
  const { error } = await supabase.from("reports").insert({
    reporter_id: g.user.id,
    target_type: g.body.targetType,
    target_id: g.body.targetId,
    reason: g.body.reason,
    details: g.body.details,
  });

  if (error) return fail(400, "Could not file that report.");
  return json({ ok: true }, { status: 201 });
}
