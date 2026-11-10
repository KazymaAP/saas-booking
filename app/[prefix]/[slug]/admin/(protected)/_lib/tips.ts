// _lib/tips.ts — ключи одноразовых подсказок в localStorage (ТЗ §13.13). Чистый модуль, покрыт тестами.
// Префикс версии: если текст подсказок сильно изменится, поднимем v1 → v2, и их увидят снова.
export const TIP_PREFIX = 'panel-tip:v1';

export const TIPS = ['dashboard', 'bookings', 'services', 'photos'] as const;
export type TipKey = (typeof TIPS)[number];

export function tipStorageKey(slug: string, tip: TipKey): string {
  return `${TIP_PREFIX}:${slug.trim().toLowerCase()}:${tip}`;
}
