// app/panel/(protected)/businesses/[id]/page.tsx — карточка бизнеса (ТЗ §13.3): все поля, slug, статус, тариф,
// домен + SSL, услуги, фото, брони, история рассылки, заметки, история изменений (audit_log), кнопки действий.
// Все выборки — параллельно одним Promise.all после загрузки самой записи.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminClient } from '@/lib/supabase';
import type { Business } from '@/lib/database.types';
import { countOf, rowsOf } from '@/главная/lib/db';
import { statusLabel } from '@/главная/lib/statuses';
import { CardButtons, DomainForms, NotesForm, SlugForm, StatusControl } from './CardForms';
import { History, type AuditRow } from './History';
import { idSchema } from './schema';

export const dynamic = 'force-dynamic';

const LIMIT_BOOKINGS = 20;
const LIMIT_OUTREACH = 10;
const LIMIT_HISTORY = 50;
const TZ = 'Europe/Moscow';

type Card = Business & { ssl_status: string | null; refused_at: string | null; vertical_templates: { name: string; url_prefix: string } | null };
type ServiceRow = { id: string; name: string; price: number; duration_minutes: number; is_active: boolean };
type PhotoRow = { id: string; url: string | null; alt: string | null };
type BookingRow = { id: string; scheduled_at: string; status: string; services: { name: string } | null };
type OutreachRow = { id: string; status: string | null; sent_at: string | null; opened_at: string | null; clicked_at: string | null };

const BOOKING_LABEL: Record<string, string> = { new: 'Новая', confirmed: 'Подтверждена', cancelled: 'Отменена', done: 'Выполнена', no_show: 'Не пришёл' };
const SSL_LABEL: Record<string, string> = { pending: 'Ожидает выпуска', active: 'Активен', error: 'Ошибка' };

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ru-RU', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }) : '—');
const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('ru-RU', { timeZone: TZ }) : '—');

async function loadRelated(id: string) {
  const db = adminClient();
  const [services, photos, bookings, bookingsTotal, outreach, tariffs, history] = await Promise.all([
    db.from('services').select('id, name, price, duration_minutes, is_active').eq('business_id', id).order('sort_order').returns<ServiceRow[]>(),
    db.from('photos').select('id, url, alt').eq('business_id', id).order('sort_order').returns<PhotoRow[]>(),
    // В карточке супер-админа бронь без ПД клиента: дата, услуга, статус (ТЗ §17 — минимизация ПД).
    db.from('bookings').select('id, scheduled_at, status, services(name)').eq('business_id', id).order('scheduled_at', { ascending: false }).limit(LIMIT_BOOKINGS).returns<BookingRow[]>(),
    db.from('bookings').select('id', { count: 'exact', head: true }).eq('business_id', id),
    db.from('outreach_log').select('id, status, sent_at, opened_at, clicked_at').eq('business_id', id).order('sent_at', { ascending: false, nullsFirst: true }).limit(LIMIT_OUTREACH).returns<OutreachRow[]>(),
    db.from('settings').select('value').eq('key', 'tariffs').maybeSingle<{ value: Record<string, { name: string; price: number }> | null }>(),
    // Индекс ТЗ §4.36 idx_audit_log_entity (entity, entity_id).
    db.from('audit_log').select('id, action, payload, created_at').eq('entity', 'business').eq('entity_id', id).order('created_at', { ascending: false }).limit(LIMIT_HISTORY).returns<AuditRow[]>(),
  ]);
  // Сбой любой выборки — исключение → error.tsx («Повторить»). Раньше `data ?? []` показывал «Услуг нет»,
  // «Брони (0)», «Писем не было» — по такой карточке легко решить, что бизнесу можно слать письмо повторно.
  if (tariffs.error) throw new Error(tariffs.error.message);
  return {
    services: rowsOf(services),
    photos: rowsOf(photos),
    bookings: rowsOf(bookings),
    bookingsTotal: countOf(bookingsTotal),
    outreach: rowsOf(outreach),
    tariffs: tariffs.data?.value ?? null,
    history: rowsOf(history),
  };
}

// Поля карточки «Все поля» (ТЗ §13.3). ПД клиентов бизнеса сюда не попадают — только данные самого бизнеса.
function cardFields(b: Card, tariffs: Record<string, { name: string; price: number }> | null): [string, React.ReactNode][] {
  const plan = b.plan_type ? tariffs?.[b.plan_type] : null;
  const siteUrl = b.vertical_templates ? `/${b.vertical_templates.url_prefix}/${b.slug}` : null;

  return [
    ['Ниша', b.vertical_templates?.name ?? '—'],
    ['Статус', statusLabel(b.status)],
    ['Город', b.city ?? '—'],
    ['Адрес', b.address ?? '—'],
    ['Телефоны', b.phones?.join(', ') || '—'],
    ['Email', b.emails?.join(', ') || '—'],
    ['Сайты', b.websites?.join(', ') || '—'],
    ['Рейтинг 2GIS', b.rating ? `${b.rating} (${b.reviews_count ?? 0} отзывов)` : '—'],
    ['Тариф', plan ? `${plan.name}, ${plan.price.toLocaleString('ru-RU')} ₽/мес` : b.plan_type ?? '—'],
    ['Оплата настройки', fmt(b.paid_initial_at)],
    ['Подписка до', `${fmtDate(b.subscription_until)}${b.subscription_until && !b.subscription_active ? ' (отключена)' : ''}`],
    ['Кастомный домен', b.custom_domain ?? '—'],
    ['SSL', b.custom_domain ? SSL_LABEL[b.ssl_status ?? 'pending'] ?? b.ssl_status : '—'],
    ['Сайт', siteUrl ? <a className="underline" href={siteUrl} target="_blank" rel="noreferrer noopener">{siteUrl}</a> : '—'],
    ['Telegram', b.telegram_connected_at ? `подключён ${fmtDate(b.telegram_connected_at)}` : 'не подключён'],
    ['Ответ на письмо', b.reply_received_at ? `${fmt(b.reply_received_at)}` : '—'],
    ['Код передан', b.code_transferred_at ? `${fmtDate(b.code_transferred_at)}, поддержка до ${fmtDate(b.support_until)}` : '—'],
    ['Удаление', b.deletion_scheduled_at ? fmtDate(b.deletion_scheduled_at) : '—'],
    ['Создан', fmt(b.created_at)],
  ];
}

export default async function BusinessCard({ params }: { params: { id: string } }) {
  const id = idSchema.safeParse(params.id);
  if (!id.success) notFound();
  const { data: b, error } = await adminClient().from('businesses').select('*, vertical_templates(name, url_prefix)').eq('id', id.data).maybeSingle<Card>();
  // Сбой базы — error boundary (error.tsx, «Повторить»), а не 404: запись, скорее всего, существует.
  if (error) throw new Error(error.message);
  if (!b) notFound();
  const r = await loadRelated(b.id);
  const fields = cardFields(b, r.tariffs);

  return (
    <div className="grid gap-8">
      <nav aria-label="Хлебные крошки" className="text-[14px]"><Link className="underline" href="/panel/businesses">← Бизнесы</Link></nav>
      <header className="grid gap-3">
        <h1 className="m-0">{b.name}</h1>
        <StatusControl id={b.id} status={b.status} />
        <CardButtons id={b.id} status={b.status} previewUrl={b.preview_url} hasEmail={(b.emails?.length ?? 0) > 0} />
      </header>

      <Section id="card-fields" title="Данные">
        <dl className="m-0 grid gap-x-4 gap-y-2 text-[14px] sm:grid-cols-[200px_1fr]">
          {fields.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[#666666]">{k}</dt>
              <dd className="m-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="card-slug" title="Адрес сайта"><SlugForm id={b.id} slug={b.slug} /></Section>

      <Section id="card-domain" title="Кастомный домен и SSL">
        <DomainForms id={b.id} domain={b.custom_domain} />
        <DnsHelp slug={b.slug} prefix={b.vertical_templates?.url_prefix ?? null} />
      </Section>

      <Related r={r} />

      <Section id="card-notes" title="Заметки"><NotesForm id={b.id} notes={b.notes} /></Section>

      <Section id="card-history" title="История изменений"><History rows={r.history} limit={LIMIT_HISTORY} entityId={b.id} /></Section>
    </div>
  );
}

type Loaded = Awaited<ReturnType<typeof loadRelated>>;

// Услуги, фото, брони, рассылка (ТЗ §13.3). Отдельный компонент — чтобы карточка читалась сверху вниз.
function Related({ r }: { r: Loaded }) {
  return (
    <>
        <Section id="card-services" title={`Услуги (${r.services.length})`}>
          {r.services.length === 0 ? <Empty text="Услуг нет — появятся после генерации прототипа." /> : (
            <ul className="m-0 grid gap-1 pl-5 text-[14px]">
              {r.services.map((s) => <li key={s.id}>{s.name} — {Number(s.price).toLocaleString('ru-RU')} ₽, {s.duration_minutes} мин{s.is_active ? '' : ' (скрыта)'}</li>)}
            </ul>
          )}
        </Section>

        <Section id="card-photos" title={`Фото (${r.photos.length})`}>
          {r.photos.length === 0 ? <Empty text="Фото нет." /> : (
            <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-6">
              {r.photos.map((p) => (
                <li key={p.id}>
                  {p.url ? <a href={p.url} target="_blank" rel="noreferrer noopener" className="block break-all text-[12px] underline">{p.alt || 'Фото'}<span className="sr-only"> (в новой вкладке)</span></a> : <span className="text-[12px] text-[#666666]">нет файла</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="card-bookings" title={`Брони (${r.bookingsTotal})`}>
          {r.bookings.length === 0 ? <Empty text="Броней не было." /> : (
            <table className="w-full max-w-[640px] text-left text-[14px]">
              <caption className="sr-only">Последние брони</caption>
              <thead><tr><th scope="col">Когда</th><th scope="col">Услуга</th><th scope="col">Статус</th></tr></thead>
              <tbody>
                {r.bookings.map((k) => <tr key={k.id}><td>{fmt(k.scheduled_at)}</td><td>{k.services?.name ?? '—'}</td><td>{BOOKING_LABEL[k.status] ?? k.status}</td></tr>)}
              </tbody>
            </table>
          )}
          {r.bookingsTotal > LIMIT_BOOKINGS && <p className="mt-2 text-[12px] text-[#666666]">Показаны последние {LIMIT_BOOKINGS}.</p>}
        </Section>

        <Section id="card-outreach" title="История рассылки">
          {r.outreach.length === 0 ? <Empty text="Писем не было." /> : (
            <ul className="m-0 grid gap-1 pl-5 text-[14px]">
              {r.outreach.map((o) => <li key={o.id}>{o.status ?? '—'} · отправлено {fmt(o.sent_at)} · открыто {o.opened_at ? fmt(o.opened_at) : 'нет'} · клик {o.clicked_at ? fmt(o.clicked_at) : 'нет'}</li>)}
            </ul>
          )}
        </Section>
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-[14px] text-[#666666]">{text}</p>;
}

function DnsHelp({ slug, prefix }: { slug: string; prefix: string | null }) {
  return (
    <details className="mt-3 max-w-[560px] text-[14px] text-[#444444]">
      <summary className="cursor-pointer">Инструкция клиенту (DNS)</summary>
      <ol className="mt-2 grid gap-1 pl-5">
        <li>Зайдите в панель регистратора домена (REG.RU, Timeweb).</li>
        <li>Добавьте запись CNAME: имя «@» или «www» → значение <code>cname.vercel-dns.com</code>.</li>
        <li>Подождите 10–60 минут и нажмите «Проверить SSL».</li>
      </ol>
      <p className="mt-2">Пока домен не работает, сайт доступен по адресу /{prefix ?? '{prefix}'}/{slug}.</p>
    </details>
  );
}
