// components/auth/AuthUi.tsx — разметка auth-страниц (вход, magic-link, приглашение, сброс пароля).
// Server Components: формы работают и без JavaScript. A11y: у каждого поля <label>, ошибка формы —
// role="alert" и связана с полями через aria-describedby, поле с ошибкой получает aria-invalid и autoFocus.
import type { ReactNode } from 'react';
import { FIELD_MAX } from '@/lib/auth-forms';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-core';
import { SubmitButton } from './SubmitButton';

const ERROR_ID = 'auth-form-error';
const NOTICE_ID = 'auth-form-notice';

export function AuthShell({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <main id="auth-main" className="mx-auto mt-16 max-w-[380px] px-4 panel-shell">
      <h1 className="text-[24px] font-semibold">{title}</h1>
      {children}
    </main>
  );
}

// Сообщения над формой: ошибка (assertive, role=alert) и нейтральное уведомление (polite, role=status).
export function AuthMessages({ error, notice }: { readonly error: string | null; readonly notice?: string | null }) {
  return (
    <>
      {error && <p id={ERROR_ID} role="alert" className="mt-3 text-[#dc2626]">{error}</p>}
      {notice && <p id={NOTICE_ID} role="status" className="mt-3 text-[#166534]">{notice}</p>}
    </>
  );
}

type FieldProps = {
  readonly name: 'email' | 'password' | 'confirm';
  readonly label: string;
  readonly type: 'email' | 'password';
  readonly autoComplete: 'username' | 'email' | 'current-password' | 'new-password';
  readonly invalid?: boolean;
  readonly focus?: boolean;
  readonly hint?: string;
  readonly defaultValue?: string;
  readonly readOnly?: boolean;
  readonly minLength?: number;
};

export function AuthField(props: FieldProps) {
  const id = `auth-${props.name}`;
  const hintId = props.hint ? `${id}-hint` : null;
  const describedBy = [props.invalid ? ERROR_ID : null, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-[14px] font-medium">{props.label}</label>
      <input
        id={id}
        name={props.name}
        type={props.type}
        className="input"
        required
        autoComplete={props.autoComplete}
        aria-invalid={props.invalid ? true : undefined}
        aria-describedby={describedBy}
        autoFocus={props.focus}
        defaultValue={props.defaultValue}
        readOnly={props.readOnly}
        minLength={props.minLength}
        maxLength={FIELD_MAX[props.name]}
        spellCheck={false}
        autoCapitalize="none"
      />
      {props.hint && <p id={hintId ?? undefined} className="text-[13px] text-[#6b6b6b]">{props.hint}</p>}
    </div>
  );
}

export function AuthForm({ action, children, submit, pending }: {
  readonly action: (form: FormData) => Promise<void>;
  readonly children: ReactNode;
  readonly submit: string;
  readonly pending: string;
}) {
  return (
    <form action={action} className="mt-6 grid gap-3" noValidate={false}>
      {children}
      <SubmitButton label={submit} pendingLabel={pending} />
    </form>
  );
}

export function HiddenField({ name, value }: { readonly name: 'next' | 'token'; readonly value: string | null }) {
  return value ? <input type="hidden" name={name} value={value} /> : null;
}

export function AuthLinks({ links }: { readonly links: ReadonlyArray<{ readonly href: string; readonly label: string }> }) {
  return (
    <nav aria-label="Другие способы входа" className="mt-6 grid gap-2 text-[14px]">
      {links.map((l) => <a key={l.href} href={l.href} className="underline">{l.label}</a>)}
    </nav>
  );
}

export const PASSWORD_HINT = `Не меньше ${PASSWORD_MIN_LENGTH} символов.`;
