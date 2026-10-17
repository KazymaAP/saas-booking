'use client';
// JSON-редактор для полей ниши (ТЗ §4.5): моноширинный textarea + проверка синтаксиса на лету + «Форматировать».
// Синтаксис проверяется в браузере сразу (без запроса), структура — zod на сервере; обе ошибки выводятся
// под полем и связаны с ним через aria-describedby / aria-invalid (ТЗ §19.6).
import { useCallback, useId, useMemo, useState } from 'react';
import { useFieldError } from '../_components/ActionForm';

type Props = { name: string; label: string; hint: string; defaultValue: string; rows?: number; empty: string };

const INDENT = 2;
// Ctrl/Cmd+Shift+F — форматировать, как в редакторах кода.
const FORMAT_KEY = 'f';

function syntaxError(text: string, empty: string): string | null {
  try {
    JSON.parse(text.trim() || empty);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Ошибка JSON';
  }
}

export function JsonEditor({ name, label, hint, defaultValue, rows = 6, empty }: Props) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const serverError = useFieldError(name);
  const localError = useMemo(() => syntaxError(value, empty), [value, empty]);
  const error = localError ? `Ошибка JSON: ${localError}` : serverError;

  const change = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value), []);
  const format = useCallback(() => {
    if (!syntaxError(value, empty)) setValue(JSON.stringify(JSON.parse(value.trim() || empty), null, INDENT));
  }, [value, empty]);
  const onKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === FORMAT_KEY) {
        e.preventDefault();
        format();
      }
    },
    [format],
  );

  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  return (
    <div className="grid gap-1 text-[14px]">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id}>{label}</label>
        <button type="button" onClick={format} disabled={Boolean(localError)} className="min-h-0 px-2 py-1 text-[12px]" aria-label={`Форматировать: ${label}`}>
          Форматировать
        </button>
      </div>
      <textarea
        id={id}
        name={name}
        rows={rows}
        value={value}
        onChange={change}
        onKeyDown={onKey}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${hintId} ${errId}` : hintId}
        className={`input w-full py-2 font-mono text-[12px] ${error ? '!border-[#dc2626]' : ''}`}
      />
      <span id={hintId} className="break-all text-[12px] text-[#666666]">Пример: <code>{hint}</code></span>
      {error && <span id={errId} role="alert" className="text-[12px] text-[#dc2626]">{error}</span>}
    </div>
  );
}
