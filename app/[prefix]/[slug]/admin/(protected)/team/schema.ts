// app/[prefix]/[slug]/admin/(protected)/team/schema.ts — команда бизнеса: приглашение и тип строки списка.
// Чистый модуль: используется формой (клиент), action (сервер) и тестами.
import { z } from 'zod';
import { BUILTIN_ROLES, isRole, ROLE_LABELS } from '@/lib/auth-roles';
import type { AdminUser } from '@/lib/database.types';

// Сотрудников немного (студия, салон) — лимит защищает от массового создания аккаунтов.
export const MAX_MANAGERS = 10;
export const EMAIL_MAX = 254;

export const InviteSchema = z.object({
  email: z.string().trim().toLowerCase()
    .min(1, 'Укажите email')
    .max(EMAIL_MAX, 'Слишком длинный email')
    .email('Неверный формат email'),
  role: z.string().refine(isRole, 'Неизвестная роль').default('manager'),
});

export type InviteInput = z.input<typeof InviteSchema>;
export const INVITE_FIELDS = ['email', 'role'] as const;

export type MemberRow = Pick<AdminUser, 'id' | 'email' | 'role'>;
export type InviteResult = { member: MemberRow; password: string };

export const ROLE_LABEL: Readonly<Record<string, string>> = ROLE_LABELS;
export const ROLE_OPTIONS: readonly { key: string; label: string }[] = BUILTIN_ROLES.map((key) => ({ key, label: ROLE_LABELS[key] }));

export function managersCount(rows: readonly MemberRow[]): number {
  return rows.filter((m) => m.role !== 'owner').length;
}

// Владельца удалить нельзя — ни из интерфейса, ни через action (проверяется и там).
export function canRemove(member: MemberRow): boolean {
  return member.role !== 'owner';
}
