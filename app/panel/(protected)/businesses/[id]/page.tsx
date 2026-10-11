// app/panel/(protected)/businesses/[id]/page.tsx — карточка бизнеса: все поля, домен, SSL, тариф, заметки, история (ТЗ §5.4, §50, §51).
import { notFound } from 'next/navigation';
import { adminClient } from '@/lib/supabase';
import { saveNotes, saveDomain, checkSsl } from './actions';

export const dynamic = 'force-dynamic';

export default async function BusinessDetail({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const db = adminClient();
  const { data: b } = await db.from('businesses').select('*').eq('id', params.id).maybeSingle();
  if (!b) notFound();

  const [{ data: services }, { count: bookings }, { data: outreach }, { data: tariffs }] = await Promise.all([
    db.from('services').select('name, price, duration_minutes').eq('business_id', b.id).order('sort_order'),
    db.from('bookings').select('id', { count: 'exact', head: true }).eq('business_id', b.id),
    db.from('outreach_log').select('status, sent_at, opened_at, clicked_at').eq('business_id', b.id).order('sent_at', { ascending: false }).limit(10),
    db.from('settings').select('value').eq('key', 'tariffs').maybeSingle(),
  ]);
  const plan = b.plan_type ? (tariffs?.value as Record<string, { name: string; price: number }> | null)?.[b.plan_type] : null;

  const rows: [string, string | null | undefined][] = [
    ['Slug', b.slug],
    ['Статус', b.status],
    ['Город', b.city],
    ['Адрес', b.address],
    ['Телефоны', b.phones?.join(', ')],
    ['Email', b.emails?.join(', ')],
    ['Прототип', b.preview_url],
    ['Тариф', plan ? `${plan.name}, ${plan.price} ₽/мес` : b.plan_type ?? '—'],
    ['Подписка до', b.subscription_until],
    ['Записей всего', String(bookings ?? 0)],
    ['Кастомный домен', b.custom_domain ?? '—'],
    ['SSL', b.custom_domain ? b.ssl_status : '—'],
  ];

  return (
    <div className="grid gap-8">
      <h1 className="text-[24px] font-semibold">{b.name}</h1>
      <dl className="grid grid-cols-[180px_1fr] gap-x-4 gap-y-2 text-[14px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[#666666]">{k}</dt>
            <dd className="break-all">{v ?? '—'}</dd>
          </div>
        ))}
      </dl>

      <section className="grid max-w-[520px] gap-2">
        <h2 className="text-[18px] font-semibold">Кастомный домен</h2>
        <form action={saveDomain} className="flex gap-2 text-[14px]">
          <input type="hidden" name="id" value={b.id} />
          <input name="domain" defaultValue={b.custom_domain ?? ''} placeholder="клиент.ру" className="input" />
          <button className="btn-primary" type="submit">Сохранить</button>
        </form>
        {b.custom_domain && (
          <form action={checkSsl}>
            <input type="hidden" name="id" value={b.id} />
            <button className="h-11 rounded-md border border-[#e5e5e5] px-4 text-[14px]" type="submit">Проверить SSL</button>
          </form>
        )}
        <div className="text-[14px] text-[#666666]">
          <p className="font-semibold text-[#1a1a1a]">Инструкция клиенту (DNS)</p>
          <ol className="mt-1 list-decimal pl-5">
            <li>Зайдите в панель регистратора домена (REG.RU, Timeweb).</li>
            <li>Добавьте запись CNAME: имя «@» или «www» → значение <code>cname.vercel-dns.com</code>.</li>
            <li>Подождите 10–60 минут и нажмите «Проверить SSL» здесь.</li>
          </ol>
          <p className="mt-2">Если домен не работает, сайт остаётся доступен по адресу /{'{prefix}'}/{b.slug}.</p>
        </div>
      </section>

      <section>
        <h2 className="text-[18px] font-semibold">Услуги</h2>
        <ul className="mt-2 text-[14px]">
          {(services ?? []).map((s) => <li key={s.name}>{s.name} — {Number(s.price).toLocaleString('ru-RU')} ₽, {s.duration_minutes} мин</li>)}
        </ul>
      </section>

      <section>
        <h2 className="text-[18px] font-semibold">История рассылки</h2>
        <ul className="mt-2 text-[14px]">
          {(outreach ?? []).map((o, i) => (
            <li key={i}>{o.status} · отправлено {o.sent_at ? new Date(o.sent_at).toLocaleString('ru-RU') : '—'} · открыто {o.opened_at ? 'да' : 'нет'} · клик {o.clicked_at ? 'да' : 'нет'}</li>
          ))}
          {(outreach ?? []).length === 0 && <li className="text-[#666666]">Писем не было</li>}
        </ul>
      </section>

      <section className="grid max-w-[560px] gap-2">
        <h2 className="text-[18px] font-semibold">Заметки</h2>
        <form action={saveNotes} className="grid gap-2 text-[14px]">
          <input type="hidden" name="id" value={b.id} />
          <textarea name="notes" defaultValue={b.notes ?? ''} className="input h-[120px] py-2" />
          <button className="btn-primary w-fit" type="submit">Сохранить заметку</button>
        </form>
      </section>
    </div>
  );
}
