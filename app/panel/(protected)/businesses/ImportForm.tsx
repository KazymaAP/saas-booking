'use client';
// Импорт выгрузки 2GIS (ТЗ §5.7 → /api/import/2gis, зона агента 14 — API не меняется).
// ▸ Прогресс загрузки файла — XMLHttpRequest.upload.onprogress (fetch не умеет прогресс отправки).
// ▸ После загрузки — фаза «Обработка на сервере» (неопределённый прогресс), затем итог в aria-live.
// ▸ «Только проверить» — dry run, без записи. После реального импорта — router.refresh() списка.
import { useCallback, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '../_components/Toast';
import { interpret } from './import-result';

type Phase = { kind: 'idle' } | { kind: 'upload'; pct: number } | { kind: 'process' } | { kind: 'done'; text: string; ok: boolean };

const MAX_BYTES = 10 * 1024 * 1024;

// Отправка через XHR ради события прогресса. Возвращает статус и разобранный JSON.
function send(form: FormData, onProgress: (pct: number) => void, onUploaded: () => void): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/import/2gis');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.upload.onload = onUploaded;
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.response });
    xhr.onerror = () => resolve({ status: 0, body: null });
    xhr.send(form);
  });
}

export function ImportForm() {
  const uid = useId();
  const router = useRouter();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [fileError, setFileError] = useState<string | null>(null);
  const busy = phase.kind === 'upload' || phase.kind === 'process';

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const file = form.get('file');
      if (!(file instanceof File) || file.size === 0) return setFileError('Выберите файл .xlsx');
      if (file.size > MAX_BYTES) return setFileError('Файл больше 10 МБ');
      setFileError(null);
      const dry = form.get('dry_run') === '1';
      setPhase({ kind: 'upload', pct: 0 });
      const res = await send(form, (pct) => setPhase({ kind: 'upload', pct }), () => setPhase({ kind: 'process' }));
      const result = interpret(res, dry);
      setPhase({ kind: 'done', ...result });
      toast.show(result.text, result.ok ? 'success' : 'error');
      if (result.ok && !dry) router.refresh();
      return undefined;
    },
    [router, toast],
  );

  const onSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    submit(e).catch(() => setPhase({ kind: 'done', ok: false, text: 'Ошибка: сервер не ответил' }));
  }, [submit]);

  return (
    <form onSubmit={onSubmit} className="grid max-w-[480px] gap-3 text-[14px]" aria-label="Импорт 2GIS" aria-busy={busy}>
      <ImportFields uid={uid} fileError={fileError} />
      <button type="submit" className="btn-primary w-fit" disabled={busy} aria-disabled={busy}>{busy ? 'Импорт…' : 'Загрузить'}</button>
      <ImportStatus phase={phase} />
    </form>
  );
}

function ImportFields({ uid, fileError }: { uid: string; fileError: string | null }) {
  return (
    <>
      <div className="grid gap-1">
        <label htmlFor={`${uid}-file`}>Файл выгрузки 2GIS (.xlsx, до 10 МБ)</label>
        <input
          id={`${uid}-file`}
          name="file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          aria-invalid={fileError ? true : undefined}
          aria-describedby={fileError ? `${uid}-file-err` : undefined}
        />
        {fileError && <span id={`${uid}-file-err`} className="text-[12px] text-[#dc2626]">{fileError}</span>}
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${uid}-filter`}>Фильтр по рубрике</label>
        <input id={`${uid}-filter`} name="filter" defaultValue="шин" className="input" aria-describedby={`${uid}-filter-hint`} />
        <span id={`${uid}-filter-hint`} className="text-[12px] text-[#666666]">Часть слова из рубрики 2GIS, например «шин» или «маник».</span>
      </div>
      <label htmlFor={`${uid}-dry`} className="inline-flex min-h-[44px] items-center gap-2 md:min-h-0">
        <input id={`${uid}-dry`} type="checkbox" name="dry_run" value="1" className="h-5 w-5" />
        Только проверить, без записи
      </label>
    </>
  );
}

function ImportStatus({ phase }: { phase: Phase }) {
  if (phase.kind === 'idle') return null;
  if (phase.kind === 'done') {
    return <p role={phase.ok ? 'status' : 'alert'} className={phase.ok ? 'm-0 text-[#1a1a1a]' : 'm-0 text-[#dc2626]'}>{phase.text}</p>;
  }
  const uploading = phase.kind === 'upload';
  return (
    <div className="grid gap-1">
      <div
        role="progressbar"
        aria-label={uploading ? 'Загрузка файла' : 'Обработка на сервере'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={uploading ? phase.pct : undefined}
        className="h-2 w-full overflow-hidden rounded bg-[#e5e5e5]"
      >
        <div className={`h-2 rounded bg-[#111111] ${uploading ? '' : 'w-1/3 animate-pulse'}`} style={uploading ? { width: `${phase.pct}%` } : undefined} />
      </div>
      <p aria-live="polite" className="m-0 text-[#666666]">{uploading ? `Загрузка файла: ${phase.pct}%` : 'Обработка на сервере…'}</p>
    </div>
  );
}
