'use client';
// Форма с server action и типизированным результатом (ActionResult) — общая для всех форм зоны 7.
// ▸ useFormState: результат действия приходит без перезагрузки страницы.
// ▸ Ошибки zod показываются под конкретным полем: aria-invalid + aria-describedby (ТЗ §19.6, design-spec §9).
// ▸ Общий итог — тост (aria-live), при ошибке фокус переходит на первое невалидное поле.
// ▸ Сеть/сервер не ответили — обычный отказ с тостом, форма и введённые значения остаются.
// ▸ Enter отправляет форму (нативное поведение <form>), кнопка блокируется на время запроса.
import { createContext, useCallback, useContext, useEffect, useId, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { ActionResult, FieldErrors } from '../_lib/action';
import { orNetworkError } from '../_lib/network';
import { useToast } from './Toast';

export type FormAction<T> = (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;

const ErrorsContext = createContext<FieldErrors>({});

type Props<T> = {
  action: FormAction<T>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  label?: string;
  onDone?: (res: ActionResult<T>) => void;
};

export function ActionForm<T>({ action, children, className, resetOnSuccess = false, label, onDone }: Props<T>) {
  // Отказ сети иначе ушёл бы в error boundary: раздел сменился бы на «Что-то пошло не так», введённое пропало.
  const safeAction = useCallback((prev: ActionResult<T> | null, fd: FormData) => orNetworkError(action(prev, fd)), [action]);
  const [state, formAction] = useFormState<ActionResult<T> | null, FormData>(safeAction, null);
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  // Реакция на новый результат: тост, сброс формы или фокус на первое поле с ошибкой.
  useEffect(() => {
    if (!state) return;
    toast.show(state.ok ? state.message : state.error, state.ok ? 'success' : 'error');
    if (state.ok && resetOnSuccess) formRef.current?.reset();
    if (!state.ok && state.fieldErrors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    onDone?.(state);
  }, [state, toast, resetOnSuccess, onDone]);

  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <ErrorsContext.Provider value={errors}>
      <form ref={formRef} action={formAction} className={className} aria-label={label} noValidate>
        {children}
      </form>
    </ErrorsContext.Provider>
  );
}

export function useFieldError(name: string): string | undefined {
  return useContext(ErrorsContext)[name];
}

type FieldProps = {
  name: string;
  label: string;
  hint?: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  className?: string;
  mono?: boolean;
  placeholder?: string;
  maxLength?: number;
};

// Поле с подписью, подсказкой и текстом ошибки. Подсказка и ошибка связаны с полем через aria-describedby.
export function Field({ name, label, hint, type = 'text', defaultValue, required, multiline, rows = 4, inputMode, autoComplete, className = '', mono, placeholder, maxLength }: FieldProps) {
  const id = useId();
  const error = useFieldError(name);
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    name,
    required,
    placeholder,
    maxLength,
    defaultValue: defaultValue ?? '',
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    className: `input w-full ${mono ? 'font-mono text-[12px]' : ''} ${error ? '!border-[#dc2626]' : ''}`,
  } as const;
  return (
    <div className={`grid gap-1 text-[14px] ${className}`}>
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true" className="text-[#dc2626]"> *</span>}
      </label>
      {multiline ? <textarea rows={rows} {...common} /> : <input type={type} inputMode={inputMode} autoComplete={autoComplete} {...common} />}
      {hint && <span id={hintId} className="text-[12px] text-[#666666]">{hint}</span>}
      {error && <span id={errId} className="text-[12px] text-[#dc2626]">{error}</span>}
    </div>
  );
}

// Чекбокс с подписью (кликабельна вся строка, высота ≥ 44px на телефоне).
export function CheckField({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  const id = useId();
  return (
    <div className="grid gap-1 text-[14px]">
      <label htmlFor={id} className="inline-flex min-h-[44px] items-center gap-2 md:min-h-0">
        <input id={id} type="checkbox" name={name} value="1" defaultChecked={defaultChecked} aria-describedby={hint ? `${id}-hint` : undefined} className="h-5 w-5" />
        {label}
      </label>
      {hint && <span id={`${id}-hint`} className="text-[12px] text-[#666666]">{hint}</span>}
    </div>
  );
}

// Кнопка отправки: блокируется и меняет текст, пока действие выполняется.
export function SubmitButton({ children, pendingText = 'Сохраняю…', variant = 'primary', className = '' }: { children: React.ReactNode; pendingText?: string; variant?: 'primary' | 'secondary' | 'danger'; className?: string }) {
  const { pending } = useFormStatus();
  const cls = { primary: 'btn-primary', secondary: '', danger: '!border-[#dc2626] !text-[#dc2626]' }[variant];
  return (
    <button type="submit" className={`${cls} w-fit ${className}`} disabled={pending} aria-disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

// Общая ошибка формы без привязки к полю (ключ "_").
export function FormError() {
  const error = useFieldError('_');
  if (!error) return null;
  return <p role="alert" className="text-[14px] text-[#dc2626]">{error}</p>;
}
