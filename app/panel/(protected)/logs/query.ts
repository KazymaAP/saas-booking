// app/panel/(protected)/logs/query.ts — выборка журнала: одна страница audit_log по фильтрам (ТЗ §13.7).
// ▸ Без count: audit_log растёт быстро, count(*) по нему дорог. Берём PAGE + 1 строку — так известно, есть ли дальше.
// ▸ Индекс idx_audit_log_action_created(action, created_at) покрывает и вкладку, и сортировку.
// ▸ payload маскируется повторно при показе: записи, сделанные до lib/audit с маскированием, могли содержать ПД.
import { adminClient } from '@/lib/supabase';
import { maskPayload } from '@/lib/audit';
import { ERROR_PREFIX } from '@/lib/log';
import { periodBounds, type LogFilters } from './filters';

export const LOG_PAGE = 50;

export type LogRow = {
  id: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type LogPage = { rows: LogRow[]; hasNext: boolean; failed: boolean };

export async function loadLogs(f: LogFilters): Promise<LogPage> {
  const from = (f.page - 1) * LOG_PAGE;
  let q = adminClient().from('audit_log').select('id, action, entity, entity_id, payload, created_at');
  if (f.tab === 'errors') {
    q = f.source ? q.eq('action', `${ERROR_PREFIX}${f.source}`) : q.like('action', `${ERROR_PREFIX}%`);
    if (f.q) q = q.ilike('payload->>message', `%${f.q}%`);
  } else {
    q = f.action ? q.eq('action', f.action) : q.not('action', 'like', `${ERROR_PREFIX}%`);
    if (f.entity) q = q.eq('entity', f.entity);
    if (f.entity_id) q = q.eq('entity_id', f.entity_id);
  }
  const { gte, lt } = periodBounds(f);
  if (gte) q = q.gte('created_at', gte);
  if (lt) q = q.lt('created_at', lt);
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .range(from, from + LOG_PAGE)
    .returns<LogRow[]>();
  const all = data ?? [];
  return {
    rows: all.slice(0, LOG_PAGE).map((r) => ({ ...r, payload: r.payload ? maskPayload(r.payload) : null })),
    hasNext: all.length > LOG_PAGE,
    failed: Boolean(error),
  };
}
