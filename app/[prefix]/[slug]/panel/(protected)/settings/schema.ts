// settings/schema.ts — правила настроек бизнеса (ТЗ §4.6). Чистый модуль: одна схема у формы и у server action.
// Поля приходят строками (как в input), схема нормализует: телефоны → +7XXXXXXXXXX, email → нижний регистр,
// рабочее время → интервалы ЧЧ:ММ (lib/hours.ts).
import { z } from 'zod';
import { DAY_KEYS, MAX_INPUT_LENGTH, formatIntervals, validateIntervals, type DayKey } from '@/lib/hours';
import { normalizePhone } from '@/lib/phone';
import type { Business, WorkingHours } from '@/lib/database.types';

export const SLOT_STEPS = [30, 60, 90, 120] as const;
const MAX_PHONES = 3;
const MAX_EMAILS = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function splitList(raw: string): string[] {
  return raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

const phones = z.string().max(200, 'Слишком длинно').transform((raw, ctx) => {
  const list = splitList(raw);
  if (list.length > MAX_PHONES) ctx.addIssue({ code: 'custom', message: `Не больше ${MAX_PHONES} телефонов` });
  const out: string[] = [];
  for (const p of list) {
    const n = normalizePhone(p);
    if (!n) ctx.addIssue({ code: 'custom', message: `«${p}» — нужен номер РФ: +7 999 123-45-67` });
    else if (!out.includes(n)) out.push(n);
  }
  return out;
});

const emails = z.string().max(250, 'Слишком длинно').transform((raw, ctx) => {
  const list = splitList(raw).map((e) => e.toLowerCase());
  if (list.length > MAX_EMAILS) ctx.addIssue({ code: 'custom', message: `Не больше ${MAX_EMAILS} адресов` });
  for (const e of list) if (!EMAIL_RE.test(e)) ctx.addIssue({ code: 'custom', message: `«${e}» — неверный email` });
  return Array.from(new Set(list));
});

const intIn = (min: number, max: number, unit: string) =>
  z.string().trim().regex(/^\d+$/, 'Целое число').transform(Number)
    .pipe(z.number().min(min, `От ${min} ${unit}`).max(max, `До ${max} ${unit}`));

// Каждый день — отдельное поле: ошибка показывается под нужным днём, с названием дня, а не ключом mon.
const hourField = z.string().max(MAX_INPUT_LENGTH, 'Слишком длинная строка').transform((raw, ctx) => {
  const r = validateIntervals(raw);
  if (!r.ok) {
    ctx.addIssue({ code: 'custom', message: r.error });
    return z.NEVER;
  }
  return r.value;
});

// Object.fromEntries теряет ключи в типе — приводим к записи по дням (ключи берутся из того же DAY_KEYS).
const hoursShape = Object.fromEntries(DAY_KEYS.map((d) => [d, hourField])) as Record<DayKey, typeof hourField>;

export const SettingsSchema = z.object({
  name: z.string().trim().min(2, 'Название — от 2 символов').max(120, 'Название — до 120 символов'),
  description: z.string().trim().max(1000, 'Описание — до 1000 символов'),
  city: z.string().trim().max(80, 'До 80 символов'),
  address: z.string().trim().max(250, 'До 250 символов'),
  phones,
  emails,
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Цвет в формате #RRGGBB').transform((c) => c.toLowerCase()),
  hours: z.object(hoursShape).transform((h): WorkingHours => ({ ...h })),
  slot_step_minutes: z.string().transform(Number).pipe(z.number().refine((n) => SLOT_STEPS.some((s) => s === n), 'Выберите шаг из списка')),
  cancel_hours_before: intIn(0, 72, 'ч'),
  min_hours_before: intIn(0, 72, 'ч'),
  max_days_ahead: intIn(1, 365, 'дн.'),
  auto_confirm: z.boolean(),
}).superRefine((v, ctx) => {
  // Окно записи должно существовать: «не раньше чем через N часов» меньше горизонта «на M дней вперёд».
  if (v.min_hours_before >= v.max_days_ahead * 24) {
    ctx.addIssue({ code: 'custom', path: ['min_hours_before'], message: 'Больше, чем горизонт записи — клиенты не смогут записаться' });
  }
});

export type SettingsFormValues = z.input<typeof SettingsSchema>;
export type SettingsValues = z.output<typeof SettingsSchema>;
// Плоские имена полей для подсветки ошибок: «hours.mon», «phones»…
export const SETTINGS_FIELDS = [
  'name', 'description', 'city', 'address', 'phones', 'emails', 'brand_color',
  ...DAY_KEYS.map((d) => `hours.${d}` as const),
  'slot_step_minutes', 'cancel_hours_before', 'min_hours_before', 'max_days_ahead',
] as const;

export function toSettingsForm(b: Business): SettingsFormValues {
  // То же приведение, что у hoursShape: ключи — ровно DAY_KEYS.
  const hours = Object.fromEntries(DAY_KEYS.map((d) => [d, formatIntervals(b.working_hours?.[d])])) as Record<DayKey, string>;
  return {
    name: b.name,
    description: b.description ?? '',
    city: b.city ?? '',
    address: b.address ?? '',
    phones: (b.phones ?? []).join(', '),
    emails: (b.emails ?? []).join(', '),
    brand_color: /^#[0-9a-f]{6}$/i.test(b.brand_color) ? b.brand_color : '#111111',
    hours,
    slot_step_minutes: String(b.slot_step_minutes),
    cancel_hours_before: String(b.cancel_hours_before),
    min_hours_before: String(b.min_hours_before),
    max_days_ahead: String(b.max_days_ahead),
    auto_confirm: b.auto_confirm,
  };
}
