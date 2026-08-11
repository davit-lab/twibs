// Audit & security-event writes.
//
// authentication_events is the append-only raw trail; admin_audit_logs is the
// existing human-facing audit log. Both are written server-side (service role).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface SecurityEvent {
  eventType: string;
  success: boolean;
  userId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeSecurityEvent(
  supabase: SupabaseClient,
  event: SecurityEvent,
): Promise<void> {
  await supabase.from("authentication_events").insert({
    user_id: event.userId ?? null,
    event_type: event.eventType,
    success: event.success,
    ip_hash: event.ipHash ?? null,
    user_agent: event.userAgent ?? null,
    metadata: (event.metadata as object) ?? null,
  });
}

/** Recent attempt count used for server-side rate limiting. */
export async function recentAttemptCount(
  supabase: SupabaseClient,
  ipHash: string,
  windowSeconds: number,
  eventTypes: string[],
): Promise<number> {
  const from = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { count } = await supabase
    .from("authentication_events")
    .select("*", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .in("event_type", eventTypes)
    .gt("created_at", from);
  return count ?? 0;
}

/** Write an entry to the immutable human-facing admin audit log. */
export async function writeAdminAudit(
  supabase: SupabaseClient,
  params: {
    actorId?: string | null;
    actorEmail?: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from("admin_audit_logs").insert({
    actor_id: params.actorId ?? null,
    actor_email: params.actorEmail ?? null,
    action: params.action,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    details: (params.details as object) ?? null,
  });
}
