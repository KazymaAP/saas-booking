// app/panel/(protected)/funnel/page.tsx — воронка из пяти шагов (ТЗ §5.4).
import Link from 'next/link';
import { adminClient } from '@/lib/supabase';
import { buildEmail } from '@/lib/outreach';
import { moveToInProgress, approveSelected, sendBackForRework, queueOutreach } from '../actions';
import { GenerateProgress } from './GenerateProgress';

export const dynamic = 'force-dynamic';

type Row = { id: string; name: string; city: string | null; status: string; preview_url: string | null; emails: string[] };
const PAGE = 100;
const COLS = 'id, name, city, status, preview_url, emails';

export default async function FunnelPage({ searchParams }: { searchParams: { city?: string; email?: string; tpl?: string } }) {
  const db = adminClient();

  let newQuery = db.from('businesses').select(COLS).eq('status', 'new').limit(PAGE);
  if (searchParams.city) newQuery = newQuery.eq('city', searchParams.city);
  if (searchParams.email === '1') newQuery = newQuery.neq('emails', '{}');
  const [{ data: fresh }, { data: work }, { data: ready }, { data: approved }, { data: tpls }] = await Promise.all([
    newQuery,
    db.from('businesses').select(COLS).eq('status', 'in_progress').limit(PAGE),
    db.from('businesses').select(COLS).eq('status', 'preview_ready').limit(PAGE),
    db.from('businesses').select(COLS).eq('status', 'approved').limit(PAGE),
    db.from('templates').select('id, name, subject, body').order('created_at', { ascending: false }),
  ]);

  // Шаг 5: счётчики
  const [{ count: sent }, { count: opened }, { count: clicked }, { count: replied }] = await Promise.all([
    db.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
    db.from('outreach_log').select('id', { count: 'exact', head: true }).not('opened_at', 'is', null),
    db.from('outreach_log').select('id', { count: 'exact', head: true }).not('clicked_at', 'is', null),
    db.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'replied'),
  ]);

  // Шаг 4: предпросмотр письма на первом одобренном бизнесе
  const tpl = (tpls ?? []).find((t) => t.id === searchParams.tpl) ?? null;
  const first = (approved ?? [])[0] as Row | undefined;
  let preview: { subject: string; text: string } | null = null;
  if (first) {
    const { data: full } = await db.from('businesses').select('*, vertical_templates(name)').eq('id', first.id).single();
    if (full) {
      const e = buildEmail({
        business: full as any,
        trackingToken: 'preview',
        verticalName: (full as any).vertical_templates?.name?.toLowerCase(),
        subject: tpl?.subject ?? undefined,
        body: tpl?.body ?? undefined,
      });
      preview = { subject: e.subject, text: e.text };
    }
  }

  return (
    <div className="grid gap-10">
      <header>
        <h1 className="text-[24px] font-semibold">Воронка</h1>
        <p className="text-[14px] text-[#666666]">
          Новых: {fresh?.length ?? 0} · В работе: {work?.length ?? 0} · Прототипов: {ready?.length ?? 0} · Одобрено: {approved?.length ?? 0} · Отправлено: {sent ?? 0}
        </p>
      </header>

      <Step title="1. Выбрать клиентов" hint="Фильтр: город, наличие email">
        <form className="mb-3 flex flex-wrap gap-2 text-[14px]" method="get">
          <input name="city" defaultValue={searchParams.city ?? ''} placeholder="Город" className="input max-w-[200px]" />
          <label className="flex items-center gap-1"><input type="checkbox" name="email" value="1" defaultChecked={searchParams.email === '1'} /> только с email</label>
          <button className="btn-primary" type="submit">Фильтровать</button>
        </form>
        <Table rows={(fresh ?? []) as Row[]} action={moveToInProgress} actionLabel="В работу" />
      </Step>

      <Step title="2. Сгенерировать прототипы">
        <GenerateProgress items={((work ?? []) as Row[]).map((r) => ({ id: r.id, name: r.name }))} />
      </Step>

      <Step title="3. Проверить и одобрить">
        <Table
          rows={(ready ?? []) as Row[]}
          action={approveSelected}
          actionLabel="Одобрить"
          secondary={{ action: sendBackForRework, label: 'На доработку' }}
          links
        />
      </Step>

      <Step title="4. Отправить письмо">
        <form className="mb-3 flex flex-wrap items-center gap-2 text-[14px]" method="get">
          <select name="tpl" defaultValue={searchParams.tpl ?? ''} className="input max-w-[260px]">
            <option value="">Встроенный шаблон</option>
            {(tpls ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="btn-primary" type="submit">Предпросмотр</button>
        </form>
        {preview && (
          <div className="mb-3 rounded-md border border-[#e5e5e5] p-3 text-[14px]">
            <p className="font-semibold">Предпросмотр на «{first?.name}»</p>
            <p className="mt-1">Тема: {preview.subject}</p>
            <p className="mt-2 whitespace-pre-line">{preview.text}</p>
          </div>
        )}
        <form action={queueOutreach} className="flex flex-wrap items-center gap-3 text-[14px]">
          <input type="hidden" name="template_id" value={searchParams.tpl ?? ''} />
          <span>Одобрено: {approved?.length ?? 0}. Отправка по одному письму в минуту через cron.</span>
          <button className="btn-primary" type="submit">Отправить всем одобренным</button>
        </form>
      </Step>

      <Step title="5. Дашборд рассылки">
        <div className="grid max-w-[560px] grid-cols-2 gap-3 text-[14px] md:grid-cols-5">
          <Box label="Отправлено" value={sent ?? 0} />
          <Box label="Доставлено" value={sent ?? 0} hint="= отправлено (без webhook)" />
          <Box label="Открыто" value={opened ?? 0} />
          <Box label="Клик" value={clicked ?? 0} />
          <Box label="Ответили" value={replied ?? 0} />
        </div>
        <p className="mt-3 text-[14px]"><Link className="underline" href="/panel/inbox">Перейти во входящие</Link></p>
      </Step>
    </div>
  );
}

function Box({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-md border border-[#e5e5e5] p-3">
      <div className="text-[#666666]">{label}</div>
      <div className="text-[20px] font-bold">{value}</div>
      {hint && <div className="text-[11px] text-[#666666]">{hint}</div>}
    </div>
  );
}

function Step({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[18px] font-semibold">{title}</h2>
      {hint && <p className="text-[14px] text-[#666666]">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Table({
  rows,
  action,
  actionLabel,
  secondary,
  links,
}: {
  rows: Row[];
  action: (fd: FormData) => Promise<void>;
  actionLabel: string;
  secondary?: { action: (fd: FormData) => Promise<void>; label: string };
  links?: boolean;
}) {
  if (rows.length === 0) return <p className="text-[14px] text-[#666666]">Пусто.</p>;
  return (
    <form action={action}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[14px]">
          <thead><tr className="border-b border-[#e5e5e5]"><th className="p-2"></th><th className="p-2">Название</th><th className="p-2">Город</th><th className="p-2">Прототип</th>{links && <th className="p-2">Правки</th>}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[#e5e5e5]">
                <td className="p-2"><input type="checkbox" name="ids" value={r.id} /></td>
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r.city ?? '—'}</td>
                <td className="p-2">{r.preview_url ? <a className="underline" href={r.preview_url} target="_blank" rel="noreferrer">Открыть</a> : '—'}</td>
                {links && <td className="p-2"><Link className="underline" href={`/panel/businesses/${r.id}`}>Правки</Link></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn-primary" type="submit">{actionLabel}</button>
        {secondary && (
          <button className="h-11 rounded-md border border-[#e5e5e5] px-4" type="submit" formAction={secondary.action}>
            {secondary.label}
          </button>
        )}
      </div>
    </form>
  );
}
