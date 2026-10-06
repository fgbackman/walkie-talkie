import { guard, json, fail } from "@/lib/api";
import { resolveReportSchema } from "@/lib/validation";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const g = await guard(request, resolveReportSchema, {
    bucket: "admin.reports",
    max: 120,
    windowS: 60,
  });
  if (!g.ok) return g.response;

  const role = g.user.profile.role;
  if (role !== "admin" && role !== "moderator") return fail(403, "Staff only.");

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("reports")
    .update({
      status: g.body.status,
      resolution: g.body.resolution,
      handled_by: g.user.id,
      handled_at: new Date().toISOString(),
    })
    .eq("id", g.body.reportId);

  if (error) return fail(400, error.message);

  await supabase.rpc("log_audit", {
    p_action: `report.${g.body.status}`,
    p_target_type: "report",
    p_target_id: g.body.reportId,
    p_metadata: { resolution: g.body.resolution },
  });

  return json({ ok: true });
}
