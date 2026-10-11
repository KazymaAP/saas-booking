'use client';
// Загрузка фото с клиентским сжатием до 2 МБ (ТЗ §45: browser-image-compression, до 2 МБ).
import { useState } from 'react';
import imageCompression from 'browser-image-compression';

export function PhotoUploader({ action }: { action: (fd: FormData) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNote(null);
    if (file.size > 2 * 1024 * 1024) {
      setBusy(true);
      try {
        const compressed = await imageCompression(file, { maxSizeMB: 2, maxWidthOrHeight: 2000, useWebWorker: true });
        const dt = new DataTransfer();
        dt.items.add(new File([compressed], file.name.replace(/\.\w+$/, '.jpg'), { type: compressed.type || file.type }));
        e.target.files = dt.files;
        setNote(`Сжато: ${(file.size / 1048576).toFixed(1)} → ${(compressed.size / 1048576).toFixed(1)} МБ`);
      } catch {
        setNote('Не удалось сжать фото. Выберите файл меньше 5 МБ.');
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <form action={action} encType="multipart/form-data" className="grid max-w-[420px] gap-2">
      <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required onChange={onFile} className="text-[14px]" />
      <input name="alt" placeholder="Подпись (необязательно)" className="input" />
      {note && <p className="text-[13px] text-[#666666]">{note}</p>}
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Сжимаем…' : 'Загрузить'}</button>
    </form>
  );
}
