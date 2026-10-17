// texts/schema.ts — тексты сайта (custom_texts): заголовок, подзаголовок, «О нас», кнопка записи.
// Чистый модуль: лимиты и схема общие для формы, превью и server action.
import { z } from 'zod';

export const TEXT_KEYS = ['hero_title', 'hero_subtitle', 'about', 'cta'] as const;
export type TextKey = (typeof TEXT_KEYS)[number];

export const TEXT_META: Record<TextKey, { label: string; limit: number; multiline: boolean; hint: string }> = {
  hero_title: { label: 'Заголовок', limit: 120, multiline: false, hint: 'Пусто — название бизнеса' },
  hero_subtitle: { label: 'Подзаголовок', limit: 200, multiline: true, hint: 'Пусто — описание из настроек' },
  about: { label: 'О нас', limit: 1500, multiline: true, hint: 'Пусто — блок по умолчанию для вашей ниши' },
  cta: { label: 'Текст кнопки записи', limit: 30, multiline: false, hint: 'Пусто — «Записаться»' },
};

export const DEFAULT_CTA = 'Записаться';

// Управляющие символы (кроме переноса строки и табуляции) приходят при вставке из мессенджеров и ломают вёрстку.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\uFEFF]/g;
// Лимит проверяем после очистки: владелец видит в счётчике то же число, что попадёт на сайт.
// Однострочные поля (заголовок, кнопка) — переносы и повторные пробелы схлопываются: вставка из заметок не рвёт кнопку.
// Многострочные — не больше одной пустой строки подряд и без пробелов в конце строк.
// Та же функция — в счётчике символов и превью формы: цифры и вид совпадают с тем, что сохранится.
export function cleanText(k: TextKey, raw: string): string {
  const clean = raw.replace(CONTROL_RE, '');
  if (!TEXT_META[k].multiline) return clean.replace(/\s+/g, ' ').trim();
  return clean.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const text = (k: TextKey) => z.string().transform((raw) => cleanText(k, raw)).pipe(z.string().max(TEXT_META[k].limit, `До ${TEXT_META[k].limit} символов`));

export const TextsSchema = z.object({
  hero_title: text('hero_title'),
  hero_subtitle: text('hero_subtitle'),
  about: text('about'),
  cta: text('cta'),
});

export type TextsValues = z.infer<typeof TextsSchema>;

export function toTextsForm(custom: Record<string, string> | null): TextsValues {
  const src = custom ?? {};
  return { hero_title: src.hero_title ?? '', hero_subtitle: src.hero_subtitle ?? '', about: src.about ?? '', cta: src.cta ?? '' };
}

// Сливает новые значения с остальными ключами custom_texts (их пишут шаблон и супер-админка — не теряем).
// Пустая строка = «по умолчанию»: ключ удаляется, чтобы сайт взял текст шаблона.
export function mergeTexts(current: Record<string, string> | null, next: TextsValues): Record<string, string> {
  const out: Record<string, string> = { ...(current ?? {}) };
  for (const k of TEXT_KEYS) {
    if (next[k]) out[k] = next[k];
    else delete out[k];
  }
  return out;
}
