'use client';
// photos/PhotoGallery.tsx — сетка фото: загружаемые (превью сразу) + сохранённые (ТЗ §4.8, §45).
// Клиентский: optimistic-удаление с подтверждением и откатом, правка подписи, прогресс загрузки.
import Image from 'next/image';
import { useCallback, useOptimistic, useRef, useState, useTransition } from 'react';
import { useConfirm } from '../_components/ConfirmDialog';
import { useToast } from '../_components/Toast';
import { callAction } from '../_lib/client-action';
import { deletePhoto, updatePhotoAlt, type PhotoRow } from './actions';
import { PhotoUploaderLazy } from './PhotoUploaderLazy';
import { ALT_MAX, AltSchema, MAX_PHOTOS, remainingSlots } from './rules';
import { usePhotoUploads, type PendingPhoto, type UploadStage } from './usePhotoUploads';

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4';
// Размеры колонок сетки — браузер берёт подходящую ширину из srcset, а не оригинал 2000px.
const SIZES = '(min-width: 1024px) 260px, (min-width: 640px) 33vw, 50vw';

function removeById(rows: PhotoRow[], id: string): PhotoRow[] {
  return rows.filter((r) => r.id !== id);
}

export function PhotoGallery({ slug, rows, canEdit }: { slug: string; rows: PhotoRow[]; canEdit: boolean }) {
  const [visible, removeOptimistic] = useOptimistic(rows, removeById);
  const [, startTransition] = useTransition();
  const [announce, setAnnounce] = useState('');
  const toast = useToast();
  const [confirm, dialog] = useConfirm();
  const uploads = usePhotoUploads(slug, rows);

  const inFlight = uploads.items.filter((i) => i.stage !== 'error' && i.stage !== 'done').length;
  const remaining = remainingSlots(visible.length + inFlight);

  const onFiles = useCallback(async (files: File[], altFor: (i: number) => string) => {
    setAnnounce(`Загружаем фото: ${files.length}`);
    const count = await uploads.add(files, altFor);
    if (count > 0) toast.success(count === 1 ? 'Фото добавлено' : `Добавлено фото: ${count}`);
    if (count < files.length) toast.error(`Не загружено: ${files.length - count}. Нажмите «Повторить» на карточке`);
    setAnnounce(`Загружено ${count} из ${files.length}`);
    return count;
  }, [toast, uploads]);

  const remove = useCallback(async (row: PhotoRow) => {
    const yes = await confirm({ title: 'Удалить фото?', text: row.alt ?? undefined, confirmLabel: 'Удалить', danger: true });
    if (!yes) return;
    startTransition(async () => {
      removeOptimistic(row.id);
      const res = await callAction(() => deletePhoto(slug, row.id));
      if (res.ok) toast.success(res.message ?? 'Фото удалено');
      else toast.error(res.error); // откат: фото вернётся в сетку само
      setAnnounce(res.ok ? 'Фото удалено' : `Ошибка: ${res.error}`);
    });
  }, [confirm, removeOptimistic, slug, toast]);

  const empty = visible.length === 0 && uploads.items.length === 0;

  return (
    <div className="grid gap-6">
      <p className="sr-only" aria-live="polite">{announce}</p>
      {dialog}
      {canEdit && <PhotoUploaderLazy remaining={remaining} onFiles={onFiles} />}
      <p className="!mb-0 text-[14px] text-[#595959]">Фото: {visible.length} из {MAX_PHOTOS}</p>
      {empty ? (
        <EmptyState canEdit={canEdit} />
      ) : (
        <ul className={GRID}>
          {uploads.items.map((item) => <PendingCard key={item.key} item={item} onRetry={uploads.retry} onDismiss={uploads.dismiss} />)}
          {visible.map((row) => <PhotoCard key={row.id} row={row} slug={slug} canEdit={canEdit} onRemove={remove} />)}
        </ul>
      )}
    </div>
  );
}

const STAGE_TEXT: Record<UploadStage, string> = {
  queued: 'В очереди',
  compress: 'Сжимаем',
  upload: 'Загружаем',
  save: 'Сохраняем',
  done: 'Готово',
  error: 'Ошибка',
};

function PendingCard({ item, onRetry, onDismiss }: { item: PendingPhoto; onRetry: (key: string) => void; onDismiss: (key: string) => void }) {
  const retry = useCallback(() => onRetry(item.key), [onRetry, item.key]);
  const dismiss = useCallback(() => onDismiss(item.key), [onDismiss, item.key]);
  const failed = item.stage === 'error';
  const showBar = !failed && item.stage !== 'done';
  return (
    <li className="grid gap-2" aria-busy={showBar}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#f0f0f0]">
        {/* blob: превью локального файла — next/image его не оптимизирует, нужен обычный img. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.preview} alt={item.alt} className={`h-full w-full object-cover ${failed ? 'opacity-40' : 'opacity-70'}`} />
      </div>
      {showBar && (
        <div
          role="progressbar"
          aria-label={`${STAGE_TEXT[item.stage]}: ${item.alt}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={item.progress}
          className="h-1.5 overflow-hidden rounded-full bg-[#e5e5e5]"
        >
          <div className="h-full rounded-full transition-[width]" style={{ width: `${item.progress}%`, background: 'var(--brand-color)' }} />
        </div>
      )}
      <p className="!m-0 text-[13px] text-[#595959]">{STAGE_TEXT[item.stage]}{showBar ? ` · ${item.progress}%` : ''}</p>
      {failed && (
        <>
          <p role="alert" className="!m-0 text-[13px] text-[#b91c1c]">{item.error}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={retry} className="!min-h-[44px]">Повторить</button>
            <button type="button" onClick={dismiss} className="!min-h-[44px]">Убрать</button>
          </div>
        </>
      )}
    </li>
  );
}

function PhotoCard({ row, slug, canEdit, onRemove }: { row: PhotoRow; slug: string; canEdit: boolean; onRemove: (row: PhotoRow) => void }) {
  const remove = useCallback(() => onRemove(row), [onRemove, row]);
  const label = row.alt ?? 'Фото без подписи';
  return (
    <li className="grid content-start gap-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#f0f0f0]">
        {row.url && <Image src={row.url} alt={label} fill sizes={SIZES} className="object-cover" />}
      </div>
      {canEdit ? <AltEditor row={row} slug={slug} /> : <p className="!m-0 text-[13px]">{label}</p>}
      {canEdit && <button type="button" onClick={remove} className="!min-h-[44px] md:!min-h-[36px]" aria-label={`Удалить фото: ${label}`}>Удалить</button>}
    </li>
  );
}

// Подпись редактируется на месте: сохраняется по Enter или при уходе с поля, если изменилась.
function AltEditor({ row, slug }: { row: PhotoRow; slug: string }) {
  const [value, setValue] = useState(row.alt ?? '');
  const [saved, setSaved] = useState(row.alt ?? '');
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const id = `alt-${row.id}`;

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setError(undefined);
  }, []);

  // Enter → сохранение → поле становится disabled → часть браузеров шлёт blur → второй save с тем же текстом.
  // Ref, а не pending: pending в замыкании обработчика blur ещё старый.
  const inFlight = useRef(false);

  const save = useCallback(() => {
    if (inFlight.current || value.trim() === saved.trim()) return;
    const parsed = AltSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    inFlight.current = true;
    startTransition(async () => {
      const res = await callAction(() => updatePhotoAlt(slug, row.id, parsed.data));
      inFlight.current = false;
      if (res.ok) {
        setSaved(parsed.data);
        toast.success(res.message ?? 'Сохранено');
      } else {
        setError(res.fieldErrors?.alt ?? res.error);
        toast.error(res.error);
      }
    });
  }, [row.id, saved, slug, toast, value]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  }, [save]);

  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="sr-only">Подпись к фото</label>
      <input
        id={id}
        value={value}
        onChange={onChange}
        onBlur={save}
        onKeyDown={onKeyDown}
        maxLength={ALT_MAX}
        disabled={pending}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="!min-h-[40px] text-[13px]"
      />
      {error && <p id={`${id}-error`} role="alert" className="!m-0 text-[12px] text-[#b91c1c]">{error}</p>}
    </div>
  );
}

function EmptyState({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-[#d4d4d4] bg-white p-8 text-center">
      <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 8" /></svg>
      <p className="!mb-0 font-medium">Фото пока нет</p>
      <p className="!mb-0 text-[14px] text-[#595959]">{canEdit ? 'Добавьте подпись и нажмите «Выбрать фото» выше.' : 'Фото добавляет владелец.'}</p>
    </div>
  );
}
