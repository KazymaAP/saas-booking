'use client';
// Восстановление из копии (ТЗ 4.0 §16.7): нужно ввести ВОССТАНОВИТЬ, затем подтвердить в диалоге.
// Результат — отчёт по таблицам (таблица с caption), ошибки в role="alert". Вызывает POST /api/backup/restore.
import { useId, useState } from 'react';
import { BACKUP_TABLES, RESTORE_CONFIRM_WORD, type RestoreReport, type TableReport } from '@/lib/backup-shared';

type ApiBody = { ok?: boolean; reason?: string; error?: string; report?: RestoreReport };

const REASON_TEXT: Record<string, string> = {
  forbidden: 'Нет доступа — войдите заново.',
  confirm: `Введите ${RESTORE_CONFIRM_WORD} для подтверждения.`,
  file_name: 'Неверное имя файла.',
  not_found: 'Файл копии не найден.',
  parse: 'Файл копии повреждён, изменён или в неизвестном формате.',
  in_progress: 'Восстановление уже идёт. Дождитесь окончания.',
  lock: 'Не удалось проверить, не идёт ли уже восстановление. Попробуйте через минуту.',
  validation: 'Неверный запрос.',
  too_large: 'Неверный запрос.',
};
const STATUS_TEXT: Record<TableReport['status'], string> = { ok: 'Восстановлено', empty: 'Пусто', error: 'Ошибка', skipped: 'Пропущено' };

function ReportTable({ report, file }: { report: RestoreReport; file: string }) {
  return (
    <table className="w-full text-left text-[13px]">
      <caption className="mb-1 text-left font-medium">Отчёт восстановления {file}: {report.total_rows} строк</caption>
      <thead>
        <tr><th scope="col" className="p-1">Таблица</th><th scope="col" className="p-1">Строк</th><th scope="col" className="p-1">Статус</th></tr>
      </thead>
      <tbody>
        {BACKUP_TABLES.map((t) => {
          const r = report.tables[t];
          return (
            <tr key={t} className="border-t border-[#e5e5e5]">
              <th scope="row" className="p-1 font-normal">{t}</th>
              <td className="p-1">{r.rows}</td>
              <td className={`p-1 ${r.status === 'error' || r.status === 'skipped' ? 'text-[#dc2626]' : ''}`}>
                {STATUS_TEXT[r.status]}{r.error ? `: ${r.error}` : ''}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

async function postRestore(file: string, confirm: string): Promise<{ body: ApiBody; error: string | null }> {
  const res = await fetch('/api/backup/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, confirm }),
  }).catch(() => null);
  if (!res) return { body: {}, error: 'Сервер не ответил. Проверьте соединение.' };
  const body: ApiBody = await res.json().catch(() => ({}));
  if (body.ok) return { body, error: null };
  if (body.report) return { body, error: 'Восстановлено частично — см. отчёт.' };
  const text = REASON_TEXT[body.reason ?? ''] ?? 'Ошибка сервера.';
  // Для повреждённого файла показываем причину (какая таблица/строка), она без данных строк.
  return { body, error: body.reason === 'parse' && body.error ? `${text} ${body.error}` : text };
}

export function RestoreForm({ file }: { file: string }) {
  const inputId = useId();
  const hintId = useId();
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<RestoreReport | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmed = word.trim() === RESTORE_CONFIRM_WORD;

  async function run() {
    // Второе подтверждение: операция перезаписывает данные в рабочей базе.
    if (!window.confirm(`Восстановить данные из ${file}? Записи с теми же id будут перезаписаны.`)) return;
    setBusy(true);
    setError(null);
    setReport(null);
    const r = await postRestore(file, word.trim());
    setBusy(false);
    setWord('');
    setReport(r.body.report ?? null);
    setError(r.error);
  }

  return (
    <details className="text-[14px]">
      <summary className="cursor-pointer text-[#dc2626]">Восстановить из этой копии</summary>
      <div className="mt-2 grid max-w-[480px] gap-2">
        <p id={hintId} className="text-[#666666]">
          Записи с теми же id будут перезаписаны значениями из копии; записи, созданные позже, сохранятся.
          Для подтверждения введите {RESTORE_CONFIRM_WORD}.
        </p>
        <label htmlFor={inputId} className="font-medium">Слово подтверждения</label>
        <input id={inputId} value={word} onChange={(e) => setWord(e.target.value)} className="input" autoComplete="off" spellCheck={false} aria-describedby={hintId} disabled={busy} />
        <button type="button" className="h-11 rounded-md border border-[#dc2626] px-4 text-[#dc2626] disabled:opacity-40" disabled={!confirmed || busy} aria-busy={busy} onClick={run}>
          {busy ? 'Восстанавливаю…' : 'Восстановить'}
        </button>
        <div aria-live="polite">{report && <ReportTable report={report} file={file} />}</div>
        {error && <p role="alert" className="text-[#dc2626]">{error}</p>}
      </div>
    </details>
  );
}
