import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Append to the audit log.
 *
 * Written with the service role because the API roles cannot insert into
 * `audit_log` at all — a user-callable logger would let anyone forge
 * entries. The actor id must come from a session the caller has already
 * verified (getApiUser / guard), never from the request body.
 *
 * The table is append-only (a trigger refuses UPDATE, DELETE, TRUNCATE).
 * Keep metadata free of emails, tokens and free-text PII.
 */
export async function audit(entry: {
  /** null only for events whose actor no longer exists (account deletion). */
  actorId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("audit_log")
    .insert({
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      metadata: entry.metadata ?? {},
    });

  if (error) {
    // The action already happened; losing its audit row is an operational
    // problem worth alerting on, not a reason to fail the request.
    console.error("audit: write failed", { action: entry.action, code: error.code });
  }
}
