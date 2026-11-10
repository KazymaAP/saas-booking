// team/schema.ts — команда бизнеса: валидация приглашения и тип строки списка (ТЗ §5.6, §13.10).
// Чистый модуль: используется формой (клиент), action (сервер) и тестами.
import { z } from 'zod';
import type { AdminUser } from '@/lib/database.types';

// Менеджеров немного (студия, салон) — лимит защищает от случайного или злонамеренного массового создания аккаунтов.
export const MAX_MANAGERS = 10;
export const EMAIL_MAX = 254;

export const InviteSchema = z.object({
  email: z.string().trim().toLowerCase()
    .min(1, 'Укажите email')
    .max(EMAIL_MAX, 'Слишком длинный email')
    .email('Неверный формат email'),
});

export type InviteInput = z.input<typeof InviteSchema>;
export const INVITE_FIELDS = ['email'] as const;

export type MemberRow = Pick<AdminUser, 'id' | 'email' | 'role'>;
export type InviteResult = { member: MemberRow; password: string };

export const ROLE_LABEL: Record<AdminUser['role'], string> = { owner: 'Владелец', manager: 'Менеджер' };

export function managersCount(rows: readonly MemberRow[]): number {
  return rows.filter((m) => m.role === 'manager').length;
}

// Владельца удалить нельзя — ни из интерфейса, ни через action (проверяется и там).
export function canRemove(member: MemberRow): boolean {
  return member.role !== 'owner';
}
