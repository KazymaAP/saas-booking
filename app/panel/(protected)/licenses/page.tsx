// app/panel/(protected)/licenses/page.tsx — лицензии: статус, последний ping, блокировка, домены, игнорирование (ТЗ §5.4, §5.8).
import { adminClient } from '@/lib/supabase';
import { createLicense, setRevoked, allowDomain, ignoreSignal } from './actions';

export const dynamic = 'force-dynamic';

export default async function LicensesPage() {
  const db = adminClient();
  const { data: licenses } = await db
    .from('licenses').select('id, license_id, domain, allowed_domains, revoked, issued_at, business_id, businesses(name)')
    .order('issued_at', { ascending: false }).limit(300);
  const { data: lastPings } = await db
    .from('license_pings').select('license_id, status, domain, pinged_at').order('pinged_at', { ascending: false }).limit(300);
  const lastByLicense = new Map<string, { status: string; domain: string; pinged_at: string }>();
  for (const p of lastPings ?? []) if (p.license_id && !lastByLicense.has(p.license_id)) lastByLicense.set(p.license_id, p);
  const { data: businesses } = await db.from('businesses').select('id, name').eq('status', 'client').limit(500);

  return (
    <div className="grid gap-8">
      <h1 className="text-[24px] font-semibold">Лицензии</h1>

      <section>
        <h2 className="text-[18px] font-semibold">Выдать лицензию</h2>
        <form action={createLicense} className="mt-3 flex flex-wrap gap-2 text-[14px]">
          <select name="business_id" className="input max-w-[280px]" required>
            <option value="">Бизнес</option>
            {(businesses ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input name="domain" placeholder="домен кода, например client.ru" className="input max-w-[280px]" required />
          <button className="btn-primary" type="submit">Выдать</button>
        </form>
      </section>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[14px]">
          <thead><tr className="border-b border-[#e5e5e5]"><th className="p-2">Бизнес</th><th className="p-2">license_id</th><th className="p-2">Домены</th><th className="p-2">Последний ping</th><th className="p-2">Действия</th></tr></thead>
          <tbody>
            {(licenses ?? []).map((l: any) => {
              const last = lastByLicense.get(l.license_id);
              return (
                <tr key={l.id} className="border-b border-[#e5e5e5] align-top">
                  <td className="p-2">{l.businesses?.name ?? '—'}{l.revoked ? ' · заблокирована' : ''}</td>
                  <td className="p-2 break-all text-[12px]">{l.license_id}</td>
                  <td className="p-2">{[l.domain, ...(l.allowed_domains ?? [])].filter((v, i, a) => v && a.indexOf(v) === i).join(', ')}</td>
                  <td className="p-2">{last ? `${last.status} · ${last.domain} · ${new Date(last.pinged_at).toLocaleString('ru-RU')}` : '—'}</td>
                  <td className="p-2">
                    <div className="flex flex-col gap-2">
                      <form action={setRevoked}>
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="revoked" value={l.revoked ? '0' : '1'} />
                        <button className="underline" type="submit">{l.revoked ? 'Разблокировать' : 'Заблокировать'}</button>
                      </form>
                      <form action={ignoreSignal}>
                        <input type="hidden" name="id" value={l.id} />
                        <button className="underline text-[#666666]" type="submit">Игнорировать сигнал</button>
                      </form>
                      <form action={allowDomain} className="flex gap-1">
                        <input type="hidden" name="id" value={l.id} />
                        <input name="domain" placeholder="разрешить домен" className="input h-9" />
                        <button className="underline" type="submit">Добавить</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
