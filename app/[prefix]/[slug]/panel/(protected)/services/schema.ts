// services/schema.ts — правила услуги (ТЗ §4.7). Чистый модуль: одна схема у формы (react-hook-form) и у server action.
import { z } from 'zod';

export const SERVICE_LIMITS = {
  nameMin: 2,
  nameMax: 120,
  descriptionMax: 500,
  priceMax: 10_000_000,
  durationMin: 5,
  durationMax: 24 * 60,
} as const;

// Поля формы — строки (так их отдают input), схема сама приводит к числам.
// Пустая цена недопустима: на сайте показывается «от N ₽», 0 — «бесплатно».
const intField = (required: string, label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, required)
    .regex(/^\d+$/, `${label} — целое число без пробелов`)
    .transform(Number)
    .pipe(z.number().min(min, `Не меньше ${min}`).max(max, `Не больше ${max.toLocaleString('ru-RU')}`));

export const ServiceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(SERVICE_LIMITS.nameMin, `Название — от ${SERVICE_LIMITS.nameMin} символов`)
    .max(SERVICE_LIMITS.nameMax, `Название — до ${SERVICE_LIMITS.nameMax} символов`),
  price: intField('Укажите цену', 'Цена', 0, SERVICE_LIMITS.priceMax),
  duration_minutes: intField('Укажите длительность', 'Длительность', SERVICE_LIMITS.durationMin, SERVICE_LIMITS.durationMax),
  description: z.string().trim().max(SERVICE_LIMITS.descriptionMax, `Описание — до ${SERVICE_LIMITS.descriptionMax} символов`),
});

export type ServiceFormValues = z.input<typeof ServiceSchema>;
export type ServiceValues = z.output<typeof ServiceSchema>;

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  is_active: boolean;
};

export const EMPTY_SERVICE: ServiceFormValues = { name: '', price: '', duration_minutes: '60', description: '' };

export function toFormValues(s: ServiceRow): ServiceFormValues {
  return { name: s.name, price: String(s.price), duration_minutes: String(s.duration_minutes), description: s.description ?? '' };
}

const PRICE = new Intl.NumberFormat('ru-RU');

export function formatPrice(price: number): string {
  return price === 0 ? 'Бесплатно' : `${PRICE.format(price)} ₽`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}
