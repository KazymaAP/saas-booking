// lib/log.ts — журнал ошибок в audit_log с префиксом error: (ТЗ §5.4 /panel/logs: ошибки email, генерации, Vercel, броней).
import { adminClient } from './supabase';

export async function logError(source: 'email' | 'generate' | 'vercel' | 'booking' | 'import' | 'cron', message: string, payload: Record<string, unknown> = {}): Promise<void> {
  await adminClient().from('audit_log').insert({
    user_id: null,
    action: `error:${source}`,
    entity: source,
    entity_id: null,
    payload: { message: message.slice(0, 500), ...payload },
  }).then(() => undefined, () => undefined);
}
