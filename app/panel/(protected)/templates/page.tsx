// app/panel/(protected)/templates/page.tsx — шаблоны писем: правка, версии, предпросмотр (ТЗ §5.4).
import { adminClient } from '@/lib/supabase';
import { buildEmail, DEFAULT_TEMPLATE } from '@/lib/outreach';
import { saveTemplate, restoreVersion, deleteTemplate } from './actions';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage({ searchParams }: { searchParams: { edit?: string } }) {
  const db = adminClient();
  const { data: templates } = await db.from('templates').select('id, name, subject, body, version, history').order('created_at', { ascending: false });
  const editing = (templates ?? []).find((t) => t.id === searchParams.edit);
  const { data: sample } = await db.from('businesses').select('*, vertical_templates(name)').eq('status', 'approved').limit(1).maybeSingle();
  const preview = sample
    ? buildEmail({ business: sample as any, trackingToken: 'preview', verticalName: (sample as any).vertical_templates?.name?.toLowerCase(), subject: editing?.subject, body: editing?.body })
    : null;

  return (
    <div className="grid gap-8">
      <h1 className="text-[24px] font-semibold">Шаблоны писем</h1>
      <p className="text-[14px] text-[#666666]">Переменные: {'{name}'}, {'{city}'}, {'{url}'}, {'{phone}'}, {'{rating}'}, {'{vertical_name_lower}'}.</p>

      <form action={saveTemplate} className="grid max-w-[640px] gap-2 text-[14px]">
        <input type="hidden" name="id" value={editing?.id ?? ''} />
        <input name="name" placeholder="Название" defaultValue={editing?.name ?? ''} className="input" required />
        <input name="subject" placeholder="Тема" defaultValue={editing?.subject ?? DEFAULT_TEMPLATE.subject} className="input" required />
        <textarea name="body" placeholder="Текст" defaultValue={editing?.body ?? DEFAULT_TEMPLATE.body} className="input h-[220px] py-2" required />
        <button className="btn-primary w-fit" type="submit">{editing ? `Сохранить (версия ${(editing.version ?? 1) + 1})` : 'Создать шаблон'}</button>
      </form>

      {preview && (
        <section className="max-w-[640px] rounded-md border border-[#e5e5e5] p-3 text-[14px]">
          <p className="font-semibold">Предпросмотр на «{(sample as any).name}»</p>
          <p className="mt-1">Тема: {preview.subject}</p>
          <p className="mt-2 whitespace-pre-line">{preview.text}</p>
        </section>
      )}

      <ul className="grid max-w-[640px] gap-3 text-[14px]">
        {(templates ?? []).map((t) => {
          const hist = (t.history as { subject: string; body: string; saved_at: string }[]) ?? [];
          return (
            <li key={t.id} className="rounded-md border border-[#e5e5e5] p-3">
              <div className="flex flex-wrap justify-between gap-2">
                <span>{t.name} — {t.subject} <span className="text-[#666666]">· v{t.version ?? 1}</span></span>
                <span className="flex gap-3">
                  <a className="underline" href={`?edit=${t.id}`}>Править</a>
                  <form action={deleteTemplate}><input type="hidden" name="id" value={t.id} /><button className="underline text-[#dc2626]" type="submit">Удалить</button></form>
                </span>
              </div>
              {hist.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[#666666]">История ({hist.length})</summary>
                  <ul className="mt-2 grid gap-1">
                    {hist.map((h, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span>{new Date(h.saved_at).toLocaleString('ru-RU')} · {h.subject}</span>
                        <form action={restoreVersion}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="index" value={i} /><button className="underline" type="submit">Вернуть</button></form>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
        {(templates ?? []).length === 0 && <li className="text-[#666666]">Шаблонов пока нет. Используется встроенный текст.</li>}
      </ul>
    </div>
  );
}
