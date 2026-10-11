// app/panel/(protected)/email-accounts/page.tsx — ящики рассылки: добавление, тесты, удаление (ТЗ §5.4, §5.5).
import { adminClient } from '@/lib/supabase';
import { addEmailAccount, toggleEmailAccount, resetEmailLimit, deleteEmailAccount, testConnection, testSend } from './actions';

export const dynamic = 'force-dynamic';

export default async function EmailAccountsPage({ searchParams }: { searchParams: { msg?: string } }) {
  const { data } = await adminClient()
    .from('email_accounts').select('id, email, active, sent_today, daily_limit').order('email');
  const totalToday = (data ?? []).reduce((s, a) => s + (a.sent_today ?? 0), 0);
  const capacity = (data ?? []).filter((a) => a.active).reduce((s, a) => s + (a.daily_limit ?? 0), 0);

  return (
    <div className="grid gap-8">
      <h1 className="text-[24px] font-semibold">Ящики рассылки</h1>
      {searchParams.msg && <p className="rounded-md bg-[#f5f5f5] p-3 text-[14px]">{searchParams.msg}</p>}
      <p className="text-[14px] text-[#666666]">Отправлено сегодня: {totalToday} из {capacity}. Пароли хранятся в зашифрованном виде.</p>

      <section>
        <h2 className="text-[18px] font-semibold">Добавить ящик</h2>
        <form action={addEmailAccount} className="mt-3 grid max-w-[520px] gap-2 text-[14px]">
          <input name="email" type="email" placeholder="Адрес ящика" className="input" required />
          <input name="pass" type="password" placeholder="Пароль приложения" className="input" required />
          <div className="grid grid-cols-2 gap-2">
            <input name="smtp_host" defaultValue="smtp.yandex.ru" className="input" />
            <input name="smtp_port" type="number" defaultValue={465} className="input" />
            <input name="imap_host" defaultValue="imap.yandex.ru" className="input" />
            <input name="imap_port" type="number" defaultValue={993} className="input" />
          </div>
          <input name="daily_limit" type="number" defaultValue={50} className="input" />
          <button className="btn-primary w-fit" type="submit">Сохранить</button>
        </form>
      </section>

      <ul className="grid gap-3 text-[14px]">
        {(data ?? []).map((a) => (
          <li key={a.id} className="grid gap-2 rounded-md border border-[#e5e5e5] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{a.email} · {a.sent_today}/{a.daily_limit} · {a.active ? 'активен' : 'выключен'}</span>
              <div className="flex flex-wrap gap-3">
                <form action={toggleEmailAccount}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="active" value={a.active ? '0' : '1'} />
                  <button className="underline" type="submit">{a.active ? 'Выключить' : 'Включить'}</button>
                </form>
                <form action={resetEmailLimit}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="underline" type="submit">Сбросить лимит</button>
                </form>
                <form action={deleteEmailAccount}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="underline text-[#dc2626]" type="submit">Удалить</button>
                </form>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <form action={testConnection}>
                <input type="hidden" name="id" value={a.id} />
                <button className="h-9 rounded-md border border-[#e5e5e5] px-3" type="submit">Проверить подключение</button>
              </form>
              <form action={testSend} className="flex gap-2">
                <input type="hidden" name="id" value={a.id} />
                <input name="to" type="email" placeholder="Кому тестовое письмо" className="input h-9 w-[220px]" required />
                <button className="h-9 rounded-md border border-[#e5e5e5] px-3" type="submit">Отправить тест</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
