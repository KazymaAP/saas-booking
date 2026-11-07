// История изменений бизнеса из audit_log (ТЗ §13.3, промт: «карточка с полной историей»).
// payload уже замаскирован при записи (lib/audit). Подписи и детали — общие с /panel/logs (_lib/audit-labels.ts).
import { actionLabel, auditDetails } from '@/главная/lib/audit-labels';

export type AuditRow = { id: string; action: string; payload: Record<string, unknown> | null; created_at: string };

export function History({ rows, limit, entityId }: { rows: AuditRow[]; limit: number; entityId: string }) {
  if (rows.length === 0) return <p className="text-[14px] text-[#666666]">Изменений пока нет.</p>;
  return (
    <>
      <ol className="m-0 grid list-none gap-2 p-0 text-[14px]">
        {rows.map((r) => {
          const extra = auditDetails(r.action, r.payload);
          return (
          <li key={r.id} className="grid gap-x-3 border-b border-[#f0f0f0] pb-2 sm:grid-cols-[150px_1fr]">
            <time dateTime={r.created_at} className="text-[#666666]">
              {new Date(r.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' })}
            </time>
            <span>
              {actionLabel(r.action)}
              {extra && <span className="text-[#666666]"> — {extra}</span>}
            </span>
          </li>
          );
        })}
      </ol>
      {rows.length === limit && (
        <p className="mt-2 text-[12px] text-[#666666]">
          Показаны последние {limit}. <a className="underline" href={`/panel/logs?tab=audit&entity_id=${entityId}`}>Весь журнал по бизнесу</a>
        </p>
      )}
    </>
  );
}
