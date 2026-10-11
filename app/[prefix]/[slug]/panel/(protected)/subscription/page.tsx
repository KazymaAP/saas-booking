// app/[prefix]/[slug]/panel/(protected)/subscription/page.tsx — подписка владельца (ТЗ §5.3, §5.9).
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function SubscriptionPage({ params }: { params: { prefix: string; slug: string } }) {
  const b = (await currentOwner(params.slug))!.business;
  const { data } = await adminClient().from('settings').select('value').eq('key', 'platform_requisites').maybeSingle();
  const req = (data?.value ?? {}) as Record<string, string>;

  const until = b.subscription_until ? new Date(b.subscription_until) : null;
  const daysLeft = until ? Math.ceil((until.getTime() - Date.now()) / 86_400_000) : null;

  return (
    <div className="grid max-w-[560px] gap-5">
      <h1 className="text-[24px] font-semibold">Подписка</h1>
      <div className="rounded-md border border-[#e5e5e5] p-4 text-[14px]">
        <div>Статус: {b.subscription_active ? 'активна' : 'не активна'}</div>
        <div>Оплачено до: {until ? until.toLocaleDateString('ru-RU') : '—'}{daysLeft !== null ? ` (осталось ${Math.max(daysLeft, 0)} дн.)` : ''}</div>
        <div>Тариф: {b.subscription_price ? `${Number(b.subscription_price).toLocaleString('ru-RU')} ₽ в месяц` : '—'}</div>
      </div>

      <div className="rounded-md border border-[#e5e5e5] p-4 text-[14px]">
        <div className="font-semibold">Продление</div>
        <p className="mt-1">Переведите сумму на реквизиты ниже и напишите нам. После оплаты подписка продлевается на 30 дней.</p>
        <ul className="mt-2 grid gap-1">
          {req.card && <li>Карта: {req.card}</li>}
          {req.bank && <li>Банк: {req.bank}</li>}
          {req.fio && <li>Получатель: {req.fio}</li>}
          {req.email && <li>Связь: {req.email}</li>}
        </ul>
        {!req.card && <p className="mt-2 text-[#666666]">Реквизиты ещё не указаны. Свяжитесь с нами по почте.</p>}
      </div>
    </div>
  );
}
