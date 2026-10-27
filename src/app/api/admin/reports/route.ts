import { guard, json, fail } from "@/lib/api";
import { resolveReportSchema } from "@/lib/validation";
import { supabaseServer } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const g = await guard(
    request,
    resolveReportSchema,
    { bucket: "admin.reports", max: 120, windowS: 60 },
    { staff: "moderator" },
  );
  if (!g.ok) return g.response;

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

  if (error) return fail(400, "Could not update that report.");

  await audit({
    actorId: g.user.id,
    action: `report.${g.body.status}`,
    targetType: "report",
    targetId: g.body.reportId,
    metadata: { resolution: g.body.resolution },
  });

  return json({ ok: true });
}
