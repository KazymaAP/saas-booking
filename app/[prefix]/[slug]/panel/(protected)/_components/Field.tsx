// _components/Field.tsx — подпись + поле + подсказка + ошибка (design-spec §6, ТЗ §19.6).
// Без хуков и 'use client': работает и в серверных, и в клиентских формах.
// fieldA11y даёт полю id, aria-invalid и aria-describedby, которые совпадают с id подсказки и ошибки в FieldFrame.
export type FieldA11y = {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
};

export function fieldA11y(id: string, error?: string, hint?: string): FieldA11y {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return { id, 'aria-invalid': Boolean(error), 'aria-describedby': ids || undefined };
}

// Рамка поля: само поле передаётся children и получает атрибуты из fieldA11y(id, error, hint).
// Ошибка — role="alert": экранный диктор объявит её сразу после проверки (ТЗ §19.6 aria-live).
export function FieldFrame({ id, label, hint, error, children }: {
  id: string;
  label: React.ReactNode;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 text-[14px]">
      <label htmlFor={id} className="font-medium">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="!m-0 text-[13px] text-[#595959]">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="!m-0 text-[13px] text-[#b91c1c]">{error}</p>}
    </div>
  );
}
