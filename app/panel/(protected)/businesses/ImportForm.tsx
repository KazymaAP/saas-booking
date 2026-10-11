'use client';
// Загрузка выгрузки 2GIS из интерфейса (ТЗ §5.7). Отправляет файл в /api/import/2gis и показывает статистику.
import { useState } from 'react';

export function ImportForm() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setResult(null);
    const res = await fetch('/api/import/2gis', { method: 'POST', body: form });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !j.ok) return setResult(`Ошибка: ${j.reason ?? 'сервер'}`);
    const s = j.stats;
    setResult(`Всего строк ${s.total}, по фильтру ${s.selected}, с email ${s.withEmail}, создано ${s.created}, обновлено ${s.updated}, ошибок ${s.errors.length}`);
  }

  return (
    <form onSubmit={submit} className="grid max-w-[480px] gap-2 text-[14px]">
      <input name="file" type="file" accept=".xlsx" required />
      <input name="filter" defaultValue="шин" className="input" placeholder="Фильтр по рубрике" />
      <label className="flex items-center gap-2"><input type="checkbox" name="dry_run" value="1" /> Только проверить, без записи</label>
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Импорт…' : 'Загрузить'}</button>
      {result && <p className="text-[#666666]">{result}</p>}
    </form>
  );
}
