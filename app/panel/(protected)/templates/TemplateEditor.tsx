'use client';
// app/panel/(protected)/templates/TemplateEditor.tsx — форма шаблона, история версий с откатом, удаление (ТЗ §4.14, §4.15).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { CLIENT_TYPES, OUTREACH_TYPES, type TemplateChannel } from '@/lib/email-template-types';
import { deleteTemplate, restoreVersion, saveTemplate, type TemplateActionState } from './actions';

export type TemplateView = {
  id: string; channel: string; type: string | null; vertical_template_id: string | null; name: string | null;
  subject: string | null; body_text: string | null; body_html: string | null; version: number | null; active: boolean; updated_at: string | null;
};
export type VersionView = { version: number; subject: string | null; body_text: string | null; created_at: string | null };

const INITIAL: TemplateActionState = { ok: true, message: '' };

function Status({ state }: { state: TemplateActionState }) {
  if (!state.message) return null;
  return <p role={state.ok ? 'status' : 'alert'} aria-live="polite" className={state.ok ? 'text-[#166534]' : 'text-[#b91c1c]'}>{state.message}</p>;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-fit" type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Сохраняю…' : label}</button>;
}

// Канал, тип и ниша: тип зависит от канала, ниша — только для рассылки.
function ClassifyFields({ f, template, verticals, channel, onChannel }: {
  f: string; template: TemplateView | null; verticals: { id: string; name: string }[]; channel: TemplateChannel; onChannel: (c: TemplateChannel) => void;
}) {
  const types = channel === 'outreach' ? OUTREACH_TYPES : CLIENT_TYPES;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label htmlFor={`${f}-channel`} className="grid gap-1">Канал
        <select id={`${f}-channel`} name="channel" className="input" value={channel} onChange={(e) => onChannel(e.target.value === 'client' ? 'client' : 'outreach')}>
          <option value="outreach">Рассылка бизнесам</option>
          <option value="client">Клиентам бизнеса</option>
        </select>
      </label>
      <label htmlFor={`${f}-type`} className="grid gap-1">Тип
        <select id={`${f}-type`} name="type" className="input" defaultValue={template?.type ?? ''} key={channel}>
          <option value="">— без типа —</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label htmlFor={`${f}-vertical`} className="grid gap-1">Ниша
        <select id={`${f}-vertical`} name="vertical_template_id" className="input" defaultValue={template?.vertical_template_id ?? ''} disabled={channel !== 'outreach'}>
          <option value="">Любая</option>
          {verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </label>
    </div>
  );
}

export function TemplateEditor({ template, verticals }: { template: TemplateView | null; verticals: { id: string; name: string }[] }) {
  const router = useRouter();
  const [channel, setChannel] = useState<TemplateChannel>(template?.channel === 'client' ? 'client' : 'outreach');
  const [state, action] = useFormState(async (prev: TemplateActionState, fd: FormData) => {
    const r = await saveTemplate(prev, fd);
    // Новый шаблон сразу открывается на правку — видны предпросмотр и версия 1.
    if (r.ok && r.id && !template) router.push(`?edit=${r.id}`);
    return r;
  }, INITIAL);
  const f = template ? `tpl-${template.id}` : 'tpl-new';

  return (
    <form action={action} className="grid content-start gap-3 text-[14px]" aria-labelledby={`${f}-title`}>
      <h2 id={`${f}-title`} className="text-[18px] font-semibold">{template ? `Правка: ${template.name} (v${template.version ?? 1})` : 'Новый шаблон'}</h2>
      <input type="hidden" name="id" value={template?.id ?? ''} />
      <label htmlFor={`${f}-name`} className="grid gap-1">Название
        <input id={`${f}-name`} name="name" className="input" defaultValue={template?.name ?? ''} required maxLength={120} />
      </label>
      <ClassifyFields f={f} template={template} verticals={verticals} channel={channel} onChannel={setChannel} />
      <label htmlFor={`${f}-subject`} className="grid gap-1">Тема
        <input id={`${f}-subject`} name="subject" className="input" defaultValue={template?.subject ?? ''} required maxLength={200} />
      </label>
      <label htmlFor={`${f}-text`} className="grid gap-1">Текст письма
        <textarea id={`${f}-text`} name="body_text" className="input h-[220px] py-2 font-mono" defaultValue={template?.body_text ?? ''} aria-describedby={`${f}-text-hint`} />
        <span id={`${f}-text-hint`} className="text-[12px] text-[#666666]">Из текста автоматически строится HTML-версия с inline-стилями.</span>
      </label>
      <details>
        <summary className="cursor-pointer">HTML-версия (необязательно)</summary>
        <label htmlFor={`${f}-html`} className="mt-2 grid gap-1">HTML письма
          <textarea id={`${f}-html`} name="body_html" className="input h-[180px] py-2 font-mono" defaultValue={template?.body_html ?? ''} />
        </label>
      </details>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="active" value="1" defaultChecked={template?.active ?? true} />
        Активен (используется при отправке)
      </label>
      {/* Снятый чекбокс не отправляется: тогда FormData.get('active') вернёт это скрытое «0». */}
      <input type="hidden" name="active" value="0" />
      <Submit label={template ? 'Сохранить новую версию' : 'Создать шаблон'} />
      <Status state={state} />
    </form>
  );
}

export function VersionList({ templateId, current, versions }: { templateId: string; current: number; versions: VersionView[] }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<TemplateActionState>(INITIAL);
  return (
    <section aria-labelledby="versions-title" aria-busy={pending} className="mt-4 grid gap-2">
      <h3 id="versions-title" className="text-[16px] font-semibold">Версии ({versions.length})</h3>
      <Status state={state} />
      <ol className="grid gap-1">
        {versions.map((v) => (
          <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#f0f0f0] p-2">
            <span>
              v{v.version}{v.version === current ? ' (текущая)' : ''} · {v.created_at ? new Date(v.created_at).toLocaleString('ru-RU') : ''}
              <span className="block text-[#666666]">{v.subject}</span>
            </span>
            {v.version !== current && (
              <button type="button" className="underline" disabled={pending} aria-label={`Откатить к версии ${v.version}`}
                onClick={() => start(async () => setState(await restoreVersion(templateId, v.version).catch(() => ({ ok: false, message: 'Сервер недоступен' }))))}>
                Откатить
              </button>
            )}
          </li>
        ))}
        {versions.length === 0 && <li className="text-[#666666]">История появится после первого сохранения.</li>}
      </ol>
    </section>
  );
}

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<TemplateActionState>(INITIAL);
  return (
    <span className="grid">
      <button type="button" className="underline text-[#dc2626]" disabled={pending} aria-label={`Удалить шаблон ${name}`}
        onClick={() => window.confirm(`Удалить шаблон «${name}»?`) && start(async () => setState(await deleteTemplate(id).catch(() => ({ ok: false, message: 'Сервер недоступен' }))))}>
        Удалить
      </button>
      <Status state={state} />
    </span>
  );
}
