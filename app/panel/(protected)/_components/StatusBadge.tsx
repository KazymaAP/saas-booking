// Бейдж статуса бизнеса: точка + текст (цвет не единственный признак, design-spec §9).
import { STATUS_TONE, isBusinessStatus, statusLabel, type Tone } from '../_lib/statuses';

const TONE_DOT: Record<Tone, string> = {
  green: 'bg-[#16a34a]',
  red: 'bg-[#dc2626]',
  yellow: 'bg-[#ca8a04]',
  gray: 'bg-[#9ca3af]',
};

export function StatusBadge({ status, pending = false }: { status: string; pending?: boolean }) {
  const tone: Tone = isBusinessStatus(status) ? STATUS_TONE[status] : 'gray';
  return (
    <span className={`inline-flex items-center gap-[6px] whitespace-nowrap rounded-full border border-[#e5e5e5] px-2 py-[2px] text-[12px] ${pending ? 'opacity-60' : ''}`}>
      <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
      {statusLabel(status)}
      {pending && <span className="sr-only"> (сохраняется)</span>}
    </span>
  );
}
