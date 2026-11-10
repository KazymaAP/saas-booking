'use client';
// photos/PhotoUploader.tsx — выбор фото и подписи (ТЗ §45, §19.6). Сама загрузка — в usePhotoUploads.
// Клиентский: проверка подписи и файлов до отправки, ошибки — под полем и в aria-live.
import { useCallback, useId, useRef, useState } from 'react';
import { FieldFrame, fieldA11y } from '../_components/Field';
import { ACCEPT, ALT_MAX, AltSchema, MAX_PHOTOS, altForIndex, formatMb, MAX_UPLOAD_BYTES, sourceFileError } from './rules';

const ALT_HINT = 'Что на фото — для поиска и незрячих посетителей. Например: «Маникюр с дизайном»';

export function PhotoUploader({ remaining, onFiles }: {
  remaining: number;
  onFiles: (files: File[], altFor: (index: number) => string) => Promise<number>;
}) {
  const uid = useId();
  const altId = `${uid}-alt`;
  const fileId = `${uid}-file`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState('');
  const [altError, setAltError] = useState<string | undefined>();
  const [fileError, setFileError] = useState<string | undefined>();
  const [dragOver, setDragOver] = useState(false);

  const onAlt = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAlt(e.target.value);
    setAltError(undefined);
  }, []);

  // Подпись обязательна: проверяем её до выбора файла (кнопка) и до приёма перетащенных файлов.
  const altReady = useCallback((): boolean => {
    const parsed = AltSchema.safeParse(alt);
    if (parsed.success) return true;
    setAltError(parsed.error.issues[0]?.message);
    document.getElementById(altId)?.focus();
    return false;
  }, [alt, altId]);

  const pick = useCallback(() => {
    if (altReady()) fileRef.current?.click();
  }, [altReady]);

  const handleFiles = useCallback((picked: File[]) => {
    if (picked.length === 0) return;

    const bad = picked.map((f) => ({ f, err: sourceFileError(f) })).filter((x) => x.err);
    const good = picked.filter((f) => !sourceFileError(f)).slice(0, remaining);
    const skippedByLimit = picked.length - bad.length - good.length;
    const notes = [
      ...bad.map((x) => `${x.f.name}: ${x.err}`),
      skippedByLimit > 0 ? `Лимит ${MAX_PHOTOS} фото: не добавлено ещё ${skippedByLimit}` : '',
    ].filter(Boolean);
    setFileError(notes.length > 0 ? notes.join('. ') : undefined);
    if (good.length === 0) return;

    const base = alt.trim();
    void onFiles(good, (i) => altForIndex(base, i)).then((count) => {
      if (count > 0) setAlt('');
    });
  }, [alt, onFiles, remaining]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // тот же файл можно выбрать повторно
    handleFiles(picked);
  }, [handleFiles]);

  // Перетаскивание с рабочего стола (десктоп). Кнопка остаётся основным способом — с клавиатуры и на телефоне.
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    // dragleave приходит и при переходе на дочерний элемент — сбрасываем, только когда курсор ушёл из зоны.
    const next = e.relatedTarget;
    if (!(next instanceof Node && e.currentTarget.contains(next))) setDragOver(false);
  }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0 && altReady()) handleFiles(dropped);
  }, [altReady, handleFiles]);

  if (remaining === 0) {
    return <p role="status" className="rounded-lg bg-[#fef9c3] p-3 text-[14px] text-[#713f12]">Загружено {MAX_PHOTOS} фото — это максимум. Удалите лишние, чтобы добавить новые.</p>;
  }

  return (
    <div
      className={`grid max-w-[560px] gap-3 rounded-xl border-2 border-dashed p-3 transition-colors ${dragOver ? 'border-[var(--brand-color)] bg-[#f6f6f6]' : 'border-transparent'}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <FieldFrame id={altId} label="Подпись к фото" hint={ALT_HINT} error={altError}>
        <input value={alt} onChange={onAlt} maxLength={ALT_MAX} autoComplete="off" {...fieldA11y(altId, altError, ALT_HINT)} />
      </FieldFrame>
      <div className="grid gap-1">
        {/* Сам input скрыт: системная кнопка выбора файла не стилизуется и плохо читается диктором. */}
        <input ref={fileRef} id={fileId} type="file" accept={ACCEPT} multiple onChange={onChange} className="sr-only" tabIndex={-1} aria-hidden="true" />
        <button type="button" onClick={pick} className="btn-primary w-full !min-h-[44px] sm:w-fit" aria-describedby={`${uid}-limits`}>
          Выбрать фото
        </button>
        <p id={`${uid}-limits`} className="!m-0 text-[13px] text-[#595959]">
          <span className="hidden md:inline">Или перетащите файлы сюда. </span>JPG, PNG или WebP. Большие фото сжимаются в браузере, на сервер — до {formatMb(MAX_UPLOAD_BYTES)}. Можно ещё {remaining} из {MAX_PHOTOS}.
        </p>
        {fileError && <p role="alert" className="!m-0 text-[13px] text-[#b91c1c]">{fileError}</p>}
      </div>
    </div>
  );
}
