// app/panel/(protected)/funnel/page.tsx — воронка из пяти шагов (ТЗ §13.2, design-spec §7.5).
// Server Component: данные шагов грузятся параллельно, счётчики — реальные (count, head), а не длина выборки.
// Массовые операции — в BulkTable (optimistic + откат), генерация — GenerateProgress (пачки + polling).
import Link from 'next/link';
import { adminClient } from '@/lib/supabase';
import { buildEmail } from '@/lib/outreach';
import type { Business } from '@/lib/database.types';
import { BulkTable, type BulkAction, type BulkRow } from '../_components/BulkTable';
import { Pager } from '../_components/Pager';
import { countOf, rowsOf } from '../_lib/db';
import { one, pageNumber, searchTerm, uuidParam, type Params } from '../_lib/url';
import { approveSelected, moveToInProgress, sendBackForRework } from './actions';
import { FUNNEL_PAGE, GENERATE_MAX } from './constants';
import { GenerateProgress } from './GenerateProgress';
import { QueueForm } from './QueueForm';
import { FunnelFilters } from './FunnelFilters';

export const dynamic = 'force-dynamic';

const COLS = 'id, name, city, status, preview_url';

type TemplateRow = { id: string; name: string | null; subject: string | null; body: string | null };
type Filters = { city: string; vertical: string; email: boolean; tpl: string; page: number };

function readFilters(sp: Params): Filters {
  return {
    city: searchTerm(sp.city, 80),
    vertical: uuidParam(sp.vertical),
    email: one(sp.email) === '1',
    tpl: uuidParam(sp.tpl),
    page: pageNumber(sp.page),
  };
}

const STEP1: BulkAction[] = [{ key: 'work', label: 'В работу', run: moveToInProgress, optimistic: 'remove' }];
const STEP3: BulkAction[] = [
  { key: 'approve', label: 'Одобрить', run: approveSelected, optimistic: 'remove' },
  { key: 'rework', label: 'На доработку', run: sendBackForRework, optimistic: 'remove', variant: 'secondary', confirm: 'Старая ссылка прототипа перестанет работать.' },
];

async function loadSteps(f: Filters) {
  const db = adminClient();
  const from = (f.page - 1) * FUNNEL_PAGE;
  // Фильтры применяются до .range(): так count считает именно отфильтрованную выборку.
  let fresh = db.from('businesses').select(COLS, { count: 'exact' }).eq('status', 'new');
  if (f.city) fresh = fresh.ilike('city', f.city);
  if (f.vertical) fresh = fresh.eq('vertical_template_id', f.vertical);
  if (f.email) fresh = fresh.neq('emails', '{}');
  const freshPage = fresh.order('created_at', { ascending: false }).range(from, from + FUNNEL_PAGE - 1).returns<BulkRow[]>();
  const head = { count: 'exact' as const, head: true };
  const [s1, s2, s3, approved, withEmail, tpls, verticals] = await Promise.all([
    freshPage,
    db.from('businesses').select('id, name', { count: 'exact' }).eq('status', 'in_progress').order('created_at').limit(GENERATE_MAX).returns<{ id: string; name: string }[]>(),
    db.from('businesses').select(COLS, { count: 'exact' }).eq('status', 'preview_ready').order('created_at').limit(FUNNEL_PAGE).returns<BulkRow[]>(),
    db.from('businesses').select('id', head).eq('status', 'approved'),
    db.from('businesses').select('id', head).eq('status', 'approved').neq('emails', '{}'),
    db.from('templates').select('id, name, subject, body').in('channel', ['email', 'outreach']).eq('active', true).order('created_at', { ascending: false }).returns<TemplateRow[]>(),
    db.from('vertical_templates').select('id, name').order('name').returns<{ id: string; name: string }[]>(),
  ]);
  // Сбой любого запроса — исключение (error.tsx), а не нули: иначе «Одобрено: 0» блокирует отправку очереди.
  return {
    fresh: { rows: rowsOf(s1), total: countOf(s1) },
    work: { rows: rowsOf(s2), total: countOf(s2) },
    ready: { rows: rowsOf(s3), total: countOf(s3) },
    approved: countOf(approved),
    withEmail: countOf(withEmail),
    templates: rowsOf(tpls),
    verticals: rowsOf(verticals),
  };
}

// Шаг 5: счётчики рассылки — пять запросов count/head, без выборки строк.
async function loadDashboard() {
  const db = adminClient();
  const head = { count: 'exact' as const, head: true };
  const [sent, opened, clicked, replied, paid] = await Promise.all([
    db.from('outreach_log').select('id', head).not('sent_at', 'is', null),
    db.from('outreach_log').select('id', head).not('opened_at', 'is', null),
    db.from('outreach_log').select('id', head).not('clicked_at', 'is', null),
    db.from('businesses').select('id', head).not('reply_received_at', 'is', null),
    db.from('businesses').select('id', head).not('paid_initial_at', 'is', null),
  ]);
  return { sent: countOf(sent), opened: countOf(opened), clicked: countOf(clicked), replied: countOf(replied), paid: countOf(paid) };
}

type PreviewRow = Business & { vertical_templates: { name: string } | null };

// Шаг 4: предпросмотр письма на первом одобренном бизнесе (ТЗ §13.2). Один запрос с join ниши.
async function loadPreview(tpl: { subject: string | null; body: string | null } | null) {
  const { data, error } = await adminClient()
    .from('businesses').select('*, vertical_templates(name)').eq('status', 'approved').order('created_at').limit(1).maybeSingle<PreviewRow>();
  // Иначе при сбое шаг 4 покажет «Нет одобренных», хотя счётчик шага говорит обратное.
  if (error) throw new Error(error.message);
  if (!data) return null;
  const e = buildEmail({
    business: data,
    trackingToken: 'preview',
    verticalName: data.vertical_templates?.name?.toLowerCase(),
    subject: tpl?.subject ?? undefined,
    body: tpl?.body ?? undefined,
  });
  return { name: data.name, to: data.emails?.[0] ?? '', subject: e.subject, text: e.text };
}

export default async function FunnelPage({ searchParams }: { searchParams: Params }) {
  const f = readFilters(searchParams);
  const [steps, dash] = await Promise.all([loadSteps(f), loadDashboard()]);
  const tpl = steps.templates.find((t) => t.id === f.tpl) ?? null;
  const preview = await loadPreview(tpl);

  return (
    <div className="grid gap-10">
      <header>
        <h1>Воронка</h1>
        <p className="text-[14px] text-[#666666]">
          Новых: {steps.fresh.total} · В работе: {steps.work.total} · Прототипов: {steps.ready.total} · Одобрено: {steps.approved} · Отправлено писем: {dash.sent}
        </p>
      </header>

      <Step n={1} title="Выбрать клиентов" count={steps.fresh.total} hint="Фильтр: город, ниша, наличие email. Статус «Новый».">
        <FunnelFilters params={searchParams} city={f.city} vertical={f.vertical} email={f.email} verticals={steps.verticals} />
        <BulkTable caption="Новые бизнесы" rows={steps.fresh.rows} columns={['city']} actions={STEP1} empty="Новых бизнесов по фильтру нет." />
        <Pager params={searchParams} page={f.page} pageSize={FUNNEL_PAGE} total={steps.fresh.total} shown={steps.fresh.rows.length} label="Страницы шага 1" />
      </Step>

      <Step n={2} title="Сгенерировать прототипы" count={steps.work.total} hint={steps.work.total > GENERATE_MAX ? `Показаны первые ${GENERATE_MAX}.` : undefined}>
        <GenerateProgress items={steps.work.rows} />
      </Step>

      <Step n={3} title="Проверить и одобрить" count={steps.ready.total} hint={steps.ready.total > FUNNEL_PAGE ? `Показаны первые ${FUNNEL_PAGE}.` : undefined}>
        <BulkTable caption="Готовые прототипы" rows={steps.ready.rows} columns={['city', 'preview', 'edit']} actions={STEP3} linkToCard={false} empty="Готовых прототипов нет." />
      </Step>

      <Step n={4} title="Отправить письмо" count={steps.approved}>
        <TemplatePicker params={searchParams} current={f.tpl} templates={steps.templates} />
        {preview ? <MailPreview {...preview} /> : <p className="text-[14px] text-[#666666]">Нет одобренных — предпросмотр появится после шага 3.</p>}
        <QueueForm templateId={f.tpl} approved={steps.approved} withEmail={steps.withEmail} />
      </Step>

      <Step n={5} title="Дашборд рассылки">
        <dl className="m-0 grid max-w-[720px] grid-cols-2 gap-3 text-[14px] md:grid-cols-5">
          <Box label="Отправлено" value={dash.sent} />
          <Box label="Открыто" value={dash.opened} />
          <Box label="Клик" value={dash.clicked} />
          <Box label="Ответили" value={dash.replied} />
          <Box label="Оплатили" value={dash.paid} />
        </dl>
        <p className="mt-3 text-[14px]"><Link className="underline" href="/panel/inbox">Перейти во входящие</Link></p>
      </Step>
    </div>
  );
}

function Step({ n, title, count, hint, children }: { n: number; title: string; count?: number; hint?: string; children: React.ReactNode }) {
  const id = `funnel-step-${n}`;
  return (
    <section aria-labelledby={id} className="rounded-[12px] border border-[#e5e5e5] bg-white p-4">
      <h2 id={id} className="flex flex-wrap items-baseline gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#111111] text-[13px] text-white" aria-hidden="true">{n}</span>
        <span><span className="sr-only">Шаг {n}. </span>{title}</span>
        {count !== undefined && <span className="text-[14px] font-normal text-[#666666]">({count})</span>}
      </h2>
      {hint && <p className="text-[14px] text-[#666666]">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Box({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[#e5e5e5] p-3">
      <dt className="text-[#666666]">{label}</dt>
      <dd className="m-0 text-[20px] font-bold">{value.toLocaleString('ru-RU')}</dd>
    </div>
  );
}

// Выбор шаблона — GET-форма: выбранный шаблон в URL, предпросмотр рендерит сервер.
function TemplatePicker({ params, current, templates }: { params: Params; current: string; templates: { id: string; name: string | null }[] }) {
  return (
    <form className="mb-3 flex flex-wrap items-end gap-2 text-[14px]" method="get" aria-label="Шаблон письма">
      {(['city', 'vertical', 'email', 'page'] as const).map((k) => {
        const v = one(params[k]);
        return v ? <input key={k} type="hidden" name={k} value={v} /> : null;
      })}
      <label className="grid gap-1" htmlFor="funnel-tpl">
        Шаблон
        <select id="funnel-tpl" name="tpl" defaultValue={current} className="input max-w-[300px]">
          <option value="">Встроенный шаблон</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name ?? 'Без названия'}</option>)}
        </select>
      </label>
      <button className="btn-primary" type="submit">Показать предпросмотр</button>
    </form>
  );
}

// Предпросмотр в рамке, как в почтовом клиенте (design-spec §7.5). Текст — без HTML, React экранирует.
function MailPreview({ name, to, subject, text }: { name: string; to: string; subject: string; text: string }) {
  return (
    <figure className="mb-4 max-w-[640px] overflow-hidden rounded-[12px] border border-[#e5e5e5] text-[14px]" aria-label={`Предпросмотр письма для «${name}»`}>
      <figcaption className="grid gap-1 border-b border-[#e5e5e5] bg-[#f6f6f6] px-4 py-3">
        <span><span className="text-[#666666]">Кому:</span> {to || '—'} ({name})</span>
        <span><span className="text-[#666666]">Тема:</span> <strong>{subject}</strong></span>
      </figcaption>
      <div className="whitespace-pre-line bg-white px-4 py-3">{text}</div>
    </figure>
  );
}
