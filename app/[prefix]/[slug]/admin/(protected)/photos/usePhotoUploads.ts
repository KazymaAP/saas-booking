'use client';
// photos/usePhotoUploads.ts — очередь загрузки: превью сразу (optimistic), затем сжатие → ссылка → PUT → запись.
// Файлы идут по одному: прогресс понятен, лимит 50 фото проверяется сервером на каждом шаге.
import { useCallback, useEffect, useRef, useState } from 'react';
import { callAction } from '../_lib/client-action';
import { confirmPhotoUpload, createPhotoUpload, type PhotoRow } from './actions';
import { compressIfNeeded, uploadToSignedUrl } from './upload-client';
import { uploadFileError } from './rules';

export type UploadStage = 'queued' | 'compress' | 'upload' | 'save' | 'done' | 'error';

export type PendingPhoto = {
  key: string;
  file: File;
  preview: string; // blob: URL — локальное превью до ответа сервера
  alt: string;
  stage: UploadStage;
  progress: number;
  error?: string;
  row?: PhotoRow;
};

type Patch = Partial<Omit<PendingPhoto, 'key' | 'file' | 'preview'>>;
type StepResult = { ok: true; row: PhotoRow } | { ok: false; error: string };

let seq = 0;

export function usePhotoUploads(slug: string, serverRows: PhotoRow[]) {
  const [items, setItems] = useState<PendingPhoto[]>([]);
  // Контроллер создаётся в эффекте: в StrictMode эффект монтируется дважды, и первый cleanup не должен
  // оставить «вечно прерванный» сигнал.
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const patch = useCallback((key: string, p: Patch) => {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));
  }, []);

  // Один файл: все шаги. Возвращает запись из БД или текст ошибки для карточки.
  const runOne = useCallback(async (item: PendingPhoto): Promise<StepResult> => {
    const signal = abortRef.current?.signal ?? AbortSignal.abort();
    patch(item.key, { stage: 'compress', progress: 0, error: undefined });
    const file = await compressIfNeeded(item.file, (p) => patch(item.key, { progress: p })).catch(() => null);
    if (!file) return { ok: false, error: 'Не удалось сжать фото. Выберите другой файл' };
    const sizeError = uploadFileError(file);
    if (sizeError) return { ok: false, error: sizeError };

    const ticket = await callAction(() => createPhotoUpload(slug, { type: file.type, size: file.size }));
    if (!ticket.ok || !ticket.data) return { ok: false, error: ticket.ok ? 'Не удалось. Попробуйте ещё раз' : ticket.error };
    const { path, signedUrl } = ticket.data;

    patch(item.key, { stage: 'upload', progress: 0 });
    const uploaded = await uploadToSignedUrl(signedUrl, file, (p) => patch(item.key, { progress: p }), signal);
    if (!uploaded) return { ok: false, error: 'Не удалось загрузить. Проверьте интернет' };

    patch(item.key, { stage: 'save', progress: 100 });
    const saved = await callAction(() => confirmPhotoUpload(slug, { path, alt: item.alt }));
    if (!saved.ok || !saved.data) return { ok: false, error: saved.ok ? 'Не удалось. Попробуйте ещё раз' : saved.error };
    return { ok: true, row: saved.data };
  }, [patch, slug]);

  // Ставит файлы в очередь. Возвращает промис всей пачки: число успешных загрузок.
  const enqueue = useCallback((list: PendingPhoto[]): Promise<number> => {
    let succeeded = 0;
    const work = queueRef.current.then(async () => {
      for (const item of list) {
        if (!abortRef.current || abortRef.current.signal.aborted) return;
        const res = await runOne(item);
        if (res.ok) succeeded += 1;
        patch(item.key, res.ok ? { stage: 'done', row: res.row } : { stage: 'error', error: res.error });
      }
    });
    queueRef.current = work;
    return work.then(() => succeeded);
  }, [patch, runOne]);

  const add = useCallback((files: File[], altFor: (i: number) => string): Promise<number> => {
    const fresh = files.map<PendingPhoto>((file, i) => ({
      key: `p${(seq += 1)}`, file, preview: URL.createObjectURL(file), alt: altFor(i), stage: 'queued', progress: 0,
    }));
    setItems((list) => [...list, ...fresh]);
    return enqueue(fresh);
  }, [enqueue]);

  // Повтор только из состояния «Ошибка»: карточка сразу уходит в «В очереди» (кнопка пропадает),
  // иначе пока очередь занята другими файлами, второй тап по «Повторить» ставил бы файл дважды → дубль в галерее.
  const retry = useCallback((key: string) => {
    const item = items.find((i) => i.key === key);
    if (!item || item.stage !== 'error') return;
    patch(key, { stage: 'queued', progress: 0, error: undefined });
    void enqueue([item]);
  }, [enqueue, items, patch]);

  const dismiss = useCallback((key: string) => {
    setItems((list) => {
      const item = list.find((i) => i.key === key);
      if (item) URL.revokeObjectURL(item.preview);
      return list.filter((i) => i.key !== key);
    });
  }, []);

  // Как только сервер прислал обновлённый список с загруженным фото — локальное превью больше не нужно.
  useEffect(() => {
    const ids = new Set(serverRows.map((r) => r.id));
    setItems((list) => {
      const keep = list.filter((i) => !(i.row && ids.has(i.row.id)));
      if (keep.length === list.length) return list;
      list.forEach((i) => { if (!keep.includes(i)) URL.revokeObjectURL(i.preview); });
      return keep;
    });
  }, [serverRows]);

  // Уход со страницы: прерываем загрузки. Превью освобождает браузер вместе с документом.
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => controller.abort();
  }, []);

  return { items, add, retry, dismiss };
}
