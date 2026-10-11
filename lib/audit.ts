// lib/audit.ts — журнал действий админки (ТЗ §33).
import { adminClient } from './supabase';

export async function audit(action: string, entity: string, entityId: string | null, payload: Record<string, unknown> = {}): Promise<void> {
  await adminClient().from('audit_log').insert({
    user_id: null,
    action,
    entity,
    entity_id: entityId,
    payload,
  });
}
