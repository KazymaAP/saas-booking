// app/panel/(protected)/templates/page.tsx — шаблоны писем: список, правка, версии, откат, предпросмотр (ТЗ §4.14, §4.15, §9.7–9.9).
// Предпросмотр строится тем же рендером, что и отправка (buildEmail / renderEmail), без трекинга.
// HTML показывается в iframe sandbox без скриптов: даже ошибка в шаблоне не выполнит код в админке.
import Link from 'next/link';
import { adminClient } from '@/lib/supabase';
import { logError } from '@/lib/log';
import { SITE_URL } from '@/lib/site';
import { buildEmail, DEFAULT_TEMPLATE, type OutreachBusiness } from '@/lib/outreach';
import { renderEmail, TEMPLATE_VARIABLES, type RenderedEmail } from '@/lib/email-render';
import { isUuidValue, sampleClientVars } from '@/lib/email-panel';
import { TemplateEditor, VersionList, DeleteTemplateButton, type TemplateView, type VersionView } from './TemplateEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Шаблоны писем' };

const MAX_TEMPLATES = 200;
const MAX_VERSIONS = 50;
const COLUMNS = 'id, channel, type, vertical_template_id, name, subject, body_text, body_html, version, active, updated_at';

type Vertical = { id: string; name: string };
type Sample = OutreachBusiness & { vertical_templates: { name: string | null } | { name: string | null }[] | null };

async function safe<T>(what: string, run: () => PromiseLike<{ data: T | null; error: { message: string } | null }>, fallback: T): Promise<T> {
  const { data, error } = await run();
  if (error) await logError('email', `templates page ${what}: ${error.message}`);
  return data ?? fallback;
}

function verticalName(s: Sample): string | undefined {
  const v = Array.isArray(s.vertical_templates) ? s.vertical_templates[0] : s.vertical_templates;
  return v?.name ?? undefined;
}

function previewFor(t: TemplateView | null, sample: Sample | null): { mail: RenderedEmail; note: string } | null {
  const subject = t?.subject ?? DEFAULT_TEMPLATE.subject;
  try {
    if (!t || t.channel === 'outreach') {
      if (!sample) return null;
      const mail = buildEmail({ business: sample, trackingToken: 'preview', verticalName: verticalName(sample), subject, body: t?.body_text ?? (t?.body_html ? undefined : DEFAULT_TEMPLATE.body), bodyHtml: t?.body_html ?? undefined });
      return { mail, note: `на данных «${sample.name}»` };
    }
    return { mail: renderEmail({ subject, body_text: t.body_text, body_html: t.body_html }, sampleClientVars(SITE_URL)), note: 'на демо-данных' };
  } catch (e) {
    return { mail: { subject, text: `Ошибка рендера: ${(e as Error).message}`, html: '' }, note: 'ошибка' };
  }
}

export default async function TemplatesPage({ searchParams }: { searchParams: { edit?: string; channel?: string } }) {
  const db = adminClient();
  const channel = searchParams.channel === 'client' || searchParams.channel === 'outreach' ? searchParams.channel : null;
  const [templates, verticals, samples] = await Promise.all([
    safe<TemplateView[]>('list', () => {
      const q = db.from('templates').select(COLUMNS).order('channel').order('name').limit(MAX_TEMPLATES);
      return channel ? q.eq('channel', channel) : q;
    }, []),
    safe<Vertical[]>('verticals', () => db.from('vertical_templates').select('id, name').order('name').limit(MAX_TEMPLATES), []),
    safe<Sample[]>('sample', () => db.from('businesses').select('name, city, slug, preview_token, phones, rating, address, vertical_templates(name)').in('status', ['approved', 'preview_ready', 'sent']).limit(1), []),
  ]);
  const editId = searchParams.edit && isUuidValue(searchParams.edit) ? searchParams.edit : null;
  const editing = templates.find((t) => t.id === editId) ?? null;
  const versions = editing
    ? await safe<VersionView[]>('versions', () => db.from('templates_versions').select('version, subject, body_text, created_at').eq('template_id', editing.id).order('version', { ascending: false }).limit(MAX_VERSIONS), [])
    : [];
  const preview = previewFor(editing, samples[0] ?? null);

  return (
    <main id="templates-page" className="grid gap-8" aria-labelledby="templates-title">
      <header className="grid gap-2">
        <h1 id="templates-title" className="text-[24px] font-semibold">Шаблоны писем</h1>
        <p className="text-[14px] text-[#666666]">Переменные: {TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(', ')}. Значения экранируются автоматически.</p>
        <nav aria-label="Канал шаблонов" className="flex gap-3 text-[14px]">
          {[{ k: null, l: 'Все' }, { k: 'outreach', l: 'Рассылка бизнесам' }, { k: 'client', l: 'Клиентам бизнеса' }].map((f) => (
            <Link key={f.l} href={f.k ? `?channel=${f.k}` : '?'} aria-current={channel === f.k ? 'page' : undefined} className={channel === f.k ? 'font-semibold underline' : 'text-[#666666] underline'}>{f.l}</Link>
          ))}
        </nav>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <TemplateEditor key={editing ? `${editing.id}:${editing.version}` : 'new'} template={editing} verticals={verticals} />
        <section aria-labelledby="preview-title" className="grid content-start gap-2 text-[14px]">
          <h2 id="preview-title" className="text-[18px] font-semibold">Предпросмотр {preview ? preview.note : ''}</h2>
          {!preview && <p className="text-[#666666]">Нет бизнеса для предпросмотра рассылки.</p>}
          {preview && (
            <>
              <p><span className="text-[#666666]">Тема:</span> {preview.mail.subject}</p>
              {preview.mail.html && <iframe title="HTML-версия письма" sandbox="" srcDoc={preview.mail.html} className="h-[420px] w-full rounded-md border border-[#e5e5e5] bg-white" />}
              <details><summary className="cursor-pointer">Текстовая версия</summary><pre className="mt-2 whitespace-pre-wrap break-words font-sans">{preview.mail.text}</pre></details>
            </>
          )}
          {editing && <VersionList templateId={editing.id} current={editing.version ?? 1} versions={versions} />}
        </section>
      </div>

      <section aria-labelledby="templates-list-title" className="grid gap-3 text-[14px]">
        <h2 id="templates-list-title" className="text-[18px] font-semibold">Все шаблоны ({templates.length})</h2>
        <ul className="grid gap-2">
          {templates.map((t) => (
            <li key={t.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 ${t.id === editId ? 'border-[#111111]' : 'border-[#e5e5e5]'}`}>
              <span>
                <strong>{t.name}</strong> · {t.channel}{t.type ? ` / ${t.type}` : ''} · v{t.version ?? 1}
                {!t.active && <span className="ml-2 text-[#b91c1c]">выключен</span>}
                <span className="block text-[#666666]">{t.subject}</span>
              </span>
              <span className="flex gap-3">
                <Link className="underline" href={`?edit=${t.id}${channel ? `&channel=${channel}` : ''}`} aria-label={`Править шаблон ${t.name}`}>Править</Link>
                <DeleteTemplateButton id={t.id} name={t.name ?? ''} />
              </span>
            </li>
          ))}
          {templates.length === 0 && <li className="text-[#666666]">Шаблонов нет — для рассылки используется встроенный текст.</li>}
        </ul>
      </section>
    </main>
  );
}
