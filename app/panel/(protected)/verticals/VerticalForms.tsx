'use client';
// Формы раздела «Ниши»: создание/правка (поля + JSON-редакторы), импорт JSON (файл или вставка),
// переключатель «Активна» в списке (optimistic, откат при ошибке).
import { useCallback, useOptimistic, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ActionForm, CheckField, Field, FormError, SubmitButton } from '@/главная/components/ActionForm';
import { useToast } from '@/главная/components/Toast';
import type { ActionResult } from '@/главная/lib/action';
import { orNetworkError } from '@/главная/lib/network';
import { importVerticals, saveVertical, setVerticalActive, type ImportResult } from './actions';
import { JsonEditor } from './JsonEditor';
import { JSON_EMPTY, JSON_HINT, type JsonField } from './schema';

export type VerticalView = {
  id: string;
  name: string;
  slug: string;
  url_prefix: string;
  icon: string | null;
  description: string | null;
  is_active: boolean;
  show_demo_mode: boolean;
  json: Record<JsonField, string>;
};

const JSON_LABEL: Record<JsonField, string> = {
  default_services: 'Услуги по умолчанию',
  default_texts: 'Тексты по умолчанию',
  default_colors: 'Цвета',
  blocks: 'Блоки сайта',
  fields: 'Дополнительные поля формы записи',
};
const JSON_ROWS: Record<JsonField, number> = { default_services: 8, default_texts: 5, default_colors: 3, blocks: 3, fields: 4 };
const ORDER: JsonField[] = ['default_services', 'default_texts', 'default_colors', 'blocks', 'fields'];

export function VerticalForm({ v }: { v: VerticalView | null }) {
  const router = useRouter();
  // После создания — переход в режим правки новой ниши (адрес с ?edit=id), без перезагрузки.
  const onDone = useCallback(
    (res: ActionResult<{ id: string }>) => {
      if (res.ok && !v) router.replace(`?edit=${res.data.id}`, { scroll: false });
    },
    [router, v],
  );
  return (
    <ActionForm action={saveVertical} onDone={onDone} className="grid max-w-[720px] gap-3" label={v ? `Правка ниши ${v.name}` : 'Новая ниша'}>
      <input type="hidden" name="id" value={v?.id ?? ''} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="name" label="Название" defaultValue={v?.name} required maxLength={80} />
        <Field name="slug" label="Slug" defaultValue={v?.slug} required maxLength={40} hint="Например, tire-service" />
        <Field name="url_prefix" label="Префикс URL" defaultValue={v?.url_prefix} required maxLength={4} hint="1–4 символа: /t/slug-бизнеса" />
        <Field name="icon" label="Иконка" defaultValue={v?.icon} maxLength={8} hint="Эмодзи или короткий код" />
      </div>
      <Field name="description" label="Описание" defaultValue={v?.description} maxLength={300} />
      {ORDER.map((f) => (
        <JsonEditor key={f} name={f} label={JSON_LABEL[f]} hint={JSON_HINT[f]} empty={JSON_EMPTY[f]} rows={JSON_ROWS[f]} defaultValue={v?.json[f] ?? JSON_EMPTY[f]} />
      ))}
      <div className="flex flex-wrap gap-4">
        <CheckField name="is_active" label="Активна" defaultChecked={v?.is_active ?? true} hint="Выключенная ниша не предлагается при импорте и генерации" />
        <CheckField name="show_demo_mode" label="Демо-режим на прототипах" defaultChecked={v?.show_demo_mode ?? true} />
      </div>
      <FormError />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{v ? 'Сохранить' : 'Создать'}</SubmitButton>
        {v && <a className="underline" href="?">Отменить правку</a>}
      </div>
    </ActionForm>
  );
}

const MAX_FILE_BYTES = 1_000_000;

export function ImportVerticalsForm() {
  const toast = useToast();
  const area = useRef<HTMLTextAreaElement>(null);
  const [report, setReport] = useState<string[]>([]);
  // Файл читается в браузере и подставляется в поле — на сервер уходит тот же JSON, что виден на экране.
  const pickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) {
        toast.show('Файл больше 1 МБ', 'error');
        return;
      }
      void file.text().then((t) => {
        if (area.current) area.current.value = t;
      });
    },
    [toast],
  );
  const onDone = useCallback((res: ActionResult<ImportResult>) => setReport(res.ok ? res.data.errors : []), []);
  return (
    <ActionForm action={importVerticals} onDone={onDone} className="grid max-w-[720px] gap-3" label="Импорт ниш из JSON">
      <label className="grid gap-1 text-[14px]" htmlFor="vert-file">
        Файл JSON (как из «Скачать все ниши»)
        <input id="vert-file" type="file" accept="application/json,.json" onChange={pickFile} />
      </label>
      <ImportArea areaRef={area} />
      <SubmitButton pendingText="Импортирую…">Импортировать</SubmitButton>
      {report.length > 0 && (
        <div role="status" className="text-[13px]">
          <p className="m-0 font-semibold">Отклонено ({report.length}):</p>
          <ul className="m-0 pl-5 text-[#dc2626]">{report.slice(0, 20).map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
    </ActionForm>
  );
}

function ImportArea({ areaRef }: { areaRef: React.RefObject<HTMLTextAreaElement> }) {
  return (
    <div className="grid gap-1 text-[14px]">
      <label htmlFor="vert-json">Или вставьте массив ниш</label>
      <textarea ref={areaRef} id="vert-json" name="json" rows={8} spellCheck={false} className="input w-full py-2 font-mono text-[12px]" aria-describedby="vert-json-hint" />
      <span id="vert-json-hint" className="text-[12px] text-[#666666]">Существующие ниши обновляются по slug, новые создаются. До 100 за раз.</span>
    </div>
  );
}

export function ActiveToggle({ id, name, active }: { id: string; name: string; active: boolean }) {
  const toast = useToast();
  const [shown, setShown] = useOptimistic(active);
  const [pending, start] = useTransition();
  const toggle = useCallback(() => {
    start(async () => {
      setShown(!active);
      const res = await orNetworkError(setVerticalActive(id, !active));
      toast.show(res.ok ? res.message : res.error, res.ok ? 'success' : 'error');
    });
  }, [id, active, setShown, toast]);
  return (
    <button type="button" role="switch" aria-checked={shown} aria-label={`Ниша «${name}» активна`} onClick={toggle} disabled={pending} className="min-h-[44px] md:min-h-0">
      {shown ? 'Активна' : 'Выключена'}
    </button>
  );
}
