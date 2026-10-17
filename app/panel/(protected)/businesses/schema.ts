// app/panel/(protected)/businesses/schema.ts — zod-схемы раздела «Бизнесы».
// Отдельный модуль: из файла 'use server' можно экспортировать только async-функции; схемы нужны и тестам.
import { z } from 'zod';
import { normalizePhone } from '@/lib/phone';

// Отсутствующее поле (не отправлено формой) = пустая строка: иначе zod отвечает «Required» на необязательное поле.
const text = () => z.string().default('');
const optional = (max: number) => text().pipe(z.string().trim().max(max, `Не длиннее ${max} символов`).transform((v) => v || null));

const phone = z
  .string()
  .trim()
  .max(40)
  .refine((v) => !v || normalizePhone(v) !== null, 'Телефон РФ: +7 и 10 цифр')
  .transform((v) => (v ? normalizePhone(v) : null));

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .refine((v) => !v || z.string().email().safeParse(v).success, 'Некорректный email')
  .transform((v) => v || null);

export const addBusinessSchema = z.object({
  name: z.string().trim().min(2, 'Минимум 2 символа').max(200, 'Не длиннее 200 символов'),
  city: optional(100),
  address: optional(300),
  phone: text().pipe(phone),
  email: text().pipe(email),
});
