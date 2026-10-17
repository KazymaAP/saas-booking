// subscription/schema.ts — форма «Я оплатил»: одна zod-схема для клиента (react-hook-form) и server action.
import { z } from 'zod';

export const PAID_LIMITS = { amountMax: 9, commentMax: 300 } as const;

export const PaidSchema = z.object({
  // Сумма необязательна: пусто — в письме будет цена тарифа. Только цифры, пробелы допускаем («2 500»).
  amount: z.string().trim()
    .transform((v) => v.replace(/\s+/g, ''))
    .refine((v) => v === '' || /^\d+$/.test(v), 'Только цифры, без копеек')
    .refine((v) => v.length <= PAID_LIMITS.amountMax, 'Слишком большая сумма'),
  comment: z.string().trim().max(PAID_LIMITS.commentMax, `Не больше ${PAID_LIMITS.commentMax} символов`),
});

export type PaidInput = z.input<typeof PaidSchema>;
export const PAID_FIELDS = ['amount', 'comment'] as const;
