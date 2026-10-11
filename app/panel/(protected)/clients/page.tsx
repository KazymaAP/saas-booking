// app/panel/(protected)/clients/page.tsx — клиенты: оплата, продление, доступ, отключение, напоминание, передача кода (ТЗ §5.4, §5.9).
import { cookies } from 'next/headers';
import { adminClient } from '@/lib/supabase';
import { FLASH_COOKIE } from '@/lib/flash';
import { markInitialPaid, extendSubscription, createOwnerAccess, disableSubscription, remindPayment, markRefused } from './actions';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const flashRaw = cookies().get(FLASH_COOKIE)?.value;
  const flash = flashRaw ? (JSON.parse(flashRaw) as { email: string; password: string }) : null;

  const { data: clients } = await adminClient()
    .from('businesses')
    .select('id, name, status, subscription_until, subscription_active, custom_domain, code_transferred_at, support_until')
    .in('status', ['client', 'approved', 'sent', 'replied', 'preview_ready', 'pending_deletion', 'transferred_out'])
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="grid gap-6">
      <h1 className="text-[24px] font-semibold">Клиенты</h1>

      {flash && (
        <div className="rounded-md border border-[#16a34a] bg-[#f0fdf4] p-4 text-[14px]">
          <p className="font-semibold">Доступ создан. Передайте клиенту. Пароль показывается один раз.</p>
          <p>Логин: {flash.email}</p>
          <p>Пароль: <code>{flash.password}</code></p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[14px]">
          <thead><tr className="border-b border-[#e5e5e5]"><th className="p-2">Бизнес</th><th className="p-2">Статус</th><th className="p-2">Оплачено до</th><th className="p-2">Код передан</th><th className="p-2">Действия</th></tr></thead>
          <tbody>
            {(clients ?? []).map((c) => (
              <tr key={c.id} className="border-b border-[#e5e5e5] align-top">
                <td className="p-2">{c.name}<div className="text-[#666666]">{c.custom_domain ?? ''}</div></td>
                <td className="p-2">{c.status}{c.status === 'client' && !c.subscription_active ? ' · отключена' : ''}</td>
                <td className="p-2">{c.subscription_until ?? '—'}</td>
                <td className="p-2">{c.code_transferred_at ? `${new Date(c.code_transferred_at).toLocaleDateString('ru-RU')}, поддержка до ${c.support_until ?? '—'}` : '—'}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    {c.status !== 'client' && (
                      <form action={markInitialPaid}><input type="hidden" name="id" value={c.id} />
                        <button className="underline" type="submit">Отметить оплату 5000</button></form>
                    )}
                    {c.status === 'client' && (
                      <form action={extendSubscription}><input type="hidden" name="id" value={c.id} />
                        <button className="underline" type="submit">Продлить на 30 дней</button></form>
                    )}
                    {c.status === 'client' && c.subscription_active && (
                      <form action={disableSubscription}><input type="hidden" name="id" value={c.id} />
                        <button className="underline" type="submit">Отключить</button></form>
                    )}
                    {c.status === 'client' && (
                      <form action={remindPayment}><input type="hidden" name="id" value={c.id} />
                        <button className="underline" type="submit">Напомнить</button></form>
                    )}
                    {c.status === 'client' && (
                      <form action={createOwnerAccess} className="flex gap-1">
                        <input type="hidden" name="id" value={c.id} />
                        <input name="email" type="email" placeholder="email владельца" className="input h-9 w-[200px]" required />
                        <button className="underline" type="submit">Создать доступ</button>
                      </form>
                    )}
                    <a className="underline" href={`/api/transfer/${c.id}`}>Скачать код (ZIP)</a>
                    {c.status !== 'client' && (
                      <form action={markRefused}><input type="hidden" name="id" value={c.id} />
                        <button className="underline text-[#666666]" type="submit">Отказ</button></form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
