// app/[prefix]/[slug]/panel/(protected)/team/page.tsx — команда бизнеса (ТЗ §5.6, §13.10).
// Серверный: список участников — один запрос. Только владелец: manager получает 404.
// Пароль нового менеджера больше не читается из cookie — его показывает TeamManager из ответа action.
import { adminClient } from '@/lib/supabase';
import { OWNER_ONLY, requirePageAccess } from '../_lib/access';
import type { MemberRow } from './schema';
import { TeamManager } from './TeamManager';

export const dynamic = 'force-dynamic';

export default async function TeamPage({ params }: { params: { prefix: string; slug: string } }) {
  const access = await requirePageAccess(params, OWNER_ONLY);
  const { data, error } = await adminClient()
    .from('admin_users')
    .select('id, email, role')
    .eq('business_id', access.business.id)
    .order('created_at')
    .returns<MemberRow[]>();
  // Ошибка БД → error.tsx, а не «в команде никого нет».
  if (error) throw new Error('team: list failed');

  return (
    <div className="grid max-w-[640px] gap-5">
      <header>
        <h1 className="!mb-1">Команда</h1>
        <p className="!mb-0 text-[14px] text-[#595959]">
          Менеджер видит и подтверждает брони, смотрит услуги и фото. Настройки, подписка, команда и выгрузка данных ему недоступны.
        </p>
      </header>
      <TeamManager slug={params.slug} members={data ?? []} currentMemberId={access.member.id} />
    </div>
  );
}
