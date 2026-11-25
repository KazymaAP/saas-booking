// app/[prefix]/[slug]/admin/(protected)/team/page.tsx — команда бизнеса (ТЗ §5.6, §13.10).
// Серверный: список участников и кастомные роли — два запроса параллельно. Только владелец (или роль с
// правом записи в раздел team) видит страницу; у остальных — 404 через requireSectionAccess.
import { adminClient } from '@/lib/supabase';
import { requireSectionAccess } from '../_lib/access';
import { inCopyMode } from '@/lib/copy-mode';
import { maskEmail } from '@/lib/copy-mask';
import { resolveMatrix } from '@/lib/custom-roles';
import { canWriteMatrix } from '@/lib/sections';
import { BUILTIN_ROLES, ROLE_LABELS } from '@/lib/auth-roles';
import type { BusinessCustomRole } from '@/lib/database.types';
import type { MemberRow } from './schema';
import { TeamManager } from './TeamManager';

export const dynamic = 'force-dynamic';

export default async function TeamPage({ params }: { params: { prefix: string; slug: string } }) {
  const access = await requireSectionAccess(params, 'team');
  const db = adminClient();
  const [membersRes, rolesRes] = await Promise.all([
    db.from('admin_users').select('id, email, role').eq('business_id', access.business.id).order('created_at').returns<MemberRow[]>(),
    db.from('business_custom_roles').select('id, name, matrix, last_used_at, removal_notified_at, created_at').eq('business_id', access.business.id).order('created_at').returns<BusinessCustomRole[]>(),
  ]);
  // Ошибка БД → error.tsx, а не «в команде никого нет».
  if (membersRes.error) throw new Error('team: list failed');

  const customRoles = rolesRes.data ?? [];
  const roleLabels: Record<string, string> = {};
  const customOptions = customRoles.map((c) => {
    const key = `custom:${c.id}`;
    roleLabels[key] = c.name;
    return { key, label: c.name };
  });
  const roleOptions = [
    ...BUILTIN_ROLES.map((key) => ({ key, label: ROLE_LABELS[key] })),
    ...customOptions,
  ];

  // Право управлять ролями = запись в раздел team (по умолчанию только у владельца).
  const matrix = await resolveMatrix(access.member.role, access.business.id);
  const canManageRoles = matrix ? canWriteMatrix(matrix, 'team') : access.member.role === 'owner';

  // Копия страницы открыта без входа: email участника — это его логин, показывать его нельзя.
  const copy = inCopyMode();
  const members = (membersRes.data ?? []).map((m) => (copy ? { ...m, email: maskEmail(m.email) } : m));

  return (
    <div className="grid max-w-[640px] gap-5">
      <header>
        <h1 className="!mb-1">Команда</h1>
        <p className="!mb-0 text-[14px] text-[#595959]">
          Менеджер видит и подтверждает брони, смотрит услуги и фото. Настройки, подписка, команда и выгрузка данных ему недоступны.
        </p>
      </header>
      <TeamManager
        slug={params.slug}
        members={members}
        currentMemberId={access.member.id}
        roleOptions={roleOptions}
        roleLabels={roleLabels}
        customRoles={customRoles}
        canManageRoles={canManageRoles}
      />
    </div>
  );
}
