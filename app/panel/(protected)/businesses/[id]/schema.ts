// app/panel/(protected)/businesses/[id]/schema.ts — zod-схемы карточки бизнеса (вынесены из 'use server' ради тестов).
import { z } from 'zod';
import { MAX_SLUG_LENGTH } from '@/lib/slug';
import { MASS_STATUSES } from '@/главная/lib/statuses';

export const MAX_NOTES = 5000;
const DOMAIN_RE = /^(?=.{4,253}$)(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const idSchema = z.string().uuid('Неверный идентификатор');

// Домен: убираем протокол, путь и www-независимо от регистра; пустая строка = отвязать домен.
export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
  .refine((v) => v === '' || DOMAIN_RE.test(v), 'Домен вида client.ru, без http:// и пути');

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Минимум 2 символа')
  .max(MAX_SLUG_LENGTH, `Не длиннее ${MAX_SLUG_LENGTH} символов`)
  .regex(SLUG_RE, 'Только латиница, цифры и дефис между ними');

// В карточке можно выставить те же статусы, что и массово. client — только через оплату, удаление — отдельной кнопкой.
export const cardStatusSchema = z.enum(MASS_STATUSES, { errorMap: () => ({ message: 'Выберите статус из списка' }) });

export const notesSchema = z.string().max(MAX_NOTES, `Не длиннее ${MAX_NOTES} символов`);
