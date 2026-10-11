// app/[prefix]/[slug]/panel/(protected)/data/page.tsx — данные и удаление аккаунта (ТЗ §32).
// Удаление: статус pending_deletion, через 30 дней очистка (cron process-deletions). Владельцу уходит уведомление.
import { redirect } from 'next/navigation';
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';
import { notifyAdmin } from '@/lib/admin-notify';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export default async function DataPage({ params, searchParams }: { params: { prefix: string; slug: string }; searchParams: { requested?: string } }) {
  const access = (await currentOwner(params.slug))!;
  const b = access.business;
  const base = `/${params.prefix}/${params.slug}/panel`;
  const isOwner = access.member.role === 'owner';

  async function requestDeletion() {
    'use server';
    const owner = await currentOwner(params.slug);
    if (!owner || owner.member.role !== 'owner') return;
    const when = new Date(Date.now() + 30 * 86_400_000).toISOString();
    await adminClient()
      .from('businesses')
      .update({ status: 'pending_deletion', deletion_scheduled_at: when })
      .eq('id', owner.business.id);
    await notifyAdmin(`🗑 Запрос на удаление: ${owner.business.name} (${owner.business.slug}), очистка ${when.slice(0, 10)}`);
    revalidatePath(`${base}/data`);
    redirect(`${base}/data?requested=1`);
  }

  return (
    <div className="grid max-w-[560px] gap-6">
      <h1 className="text-[24px] font-semibold">Данные</h1>

      <section className="grid gap-2">
        <h2 className="text-[18px] font-semibold">Выгрузка</h2>
        <p className="text-[14px] text-[#666666]">CSV со всеми бронями: дата, клиент, телефон, услуга, цена.</p>
        <a className="btn-primary w-fit" href={`${base}/export`}>Скачать CSV</a>
      </section>

      {isOwner && (
        <section className="grid gap-2">
          <h2 className="text-[18px] font-semibold">Удаление аккаунта</h2>
          {b.status === 'pending_deletion' || searchParams.requested ? (
            <p className="text-[14px]">Запрос принят. Данные будут удалены через 30 дней{b.deletion_scheduled_at ? ` (${new Date(b.deletion_scheduled_at).toLocaleDateString('ru-RU')})` : ''}.</p>
          ) : (
            <>
              <p className="text-[14px] text-[#666666]">Сайт перестанет работать, данные будут удалены через 30 дней. Журнал рассылки сохранится.</p>
              <form action={requestDeletion}>
                <button type="submit" className="h-11 rounded-md border border-[#dc2626] px-4 text-[#dc2626]">Удалить аккаунт</button>
              </form>
            </>
          )}
        </section>
      )}
    </div>
  );
}
