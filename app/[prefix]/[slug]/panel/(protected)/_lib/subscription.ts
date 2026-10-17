// _lib/subscription.ts — статус подписки для страницы «Подписка» и отметки в меню (ТЗ §5.3, §14).
// Чистый модуль: на вход — поля бизнеса и «сейчас», на выход — тон, заголовок и текст. Покрыт тестами.
import { DAY_MS, formatDate } from './time';

// Заранее предупреждаем о скором окончании — за неделю.
export const WARN_DAYS = 7;

export type SubscriptionTone = 'ok' | 'warn' | 'bad';
export type SubscriptionView = { label: string; tone: SubscriptionTone; text: string };

export function subscriptionStatus(active: boolean, untilIso: string | null, nowMs: number): SubscriptionView {
  if (!untilIso) return active
    ? { label: 'Активна', tone: 'ok', text: 'Срок не ограничен' }
    : { label: 'Не активна', tone: 'bad', text: 'Оплатите подписку, чтобы сайт принимал записи' };
  const daysLeft = Math.ceil((new Date(untilIso).getTime() - nowMs) / DAY_MS);
  if (!active || daysLeft <= 0) return { label: 'Закончилась', tone: 'bad', text: `Оплачено до ${formatDate(untilIso)}` };
  if (daysLeft <= WARN_DAYS) return { label: 'Скоро закончится', tone: 'warn', text: `Осталось ${daysLeft} дн. — до ${formatDate(untilIso)}` };
  return { label: 'Активна', tone: 'ok', text: `Оплачено до ${formatDate(untilIso)} (осталось ${daysLeft} дн.)` };
}

// Текст отметки у пункта меню (для экранного диктора — часть названия ссылки). null — отметка не нужна.
export function subscriptionAttention(active: boolean, untilIso: string | null, nowMs: number): string | null {
  const { tone, label } = subscriptionStatus(active, untilIso, nowMs);
  return tone === 'ok' ? null : label.toLowerCase();
}
