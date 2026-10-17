// lib/telegram-format.ts — чистые утилиты Telegram-интеграции без зависимостей от БД и окружения:
// экранирование HTML (parse_mode=HTML), фолбэк в простой текст, обрезка до лимита, сравнение секретов.
// Реэкспортируются из lib/telegram.ts — импортировать можно оттуда.
import { timingSafeEqual } from 'crypto';

/** Лимит длины текста sendMessage в Telegram. */
export const TELEGRAM_TEXT_LIMIT = 4096;

/** Экранирование для parse_mode=HTML: без него имя клиента с «<» ломает отправку (400). */
export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Простой текст из HTML — фолбэк, если Telegram не разобрал разметку. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;

/** Обрезка до лимита Telegram с многоточием. Суррогатная пара (эмодзи) не разрезается пополам. */
export function clampText(text: string, limit: number = TELEGRAM_TEXT_LIMIT): string {
  if (text.length <= limit) return text;
  let end = limit - 1;
  const last = text.charCodeAt(end - 1);
  if (last >= HIGH_SURROGATE_MIN && last <= HIGH_SURROGATE_MAX) end--;
  return `${text.slice(0, end)}…`;
}

/** Сравнение секретов за постоянное время (защита от timing-атак). */
export function safeEqual(received: string | null, expected: string | null | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
