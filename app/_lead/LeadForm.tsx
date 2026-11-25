'use client';
// app/_lead/LeadForm.tsx — заявка «хочу сайт» на лендинге.
// 'use client': useFormState/useFormStatus дают ответ без перезагрузки и блокировку кнопки на время отправки.
// Без JS форма тоже работает: server action принимает обычный POST.
//
// Стили полей заданы инлайн, а не классами Tailwind: лендинг оформлен предсобранным
// public/assets/detailing-scoped.css, где перечислены только использованные при сборке классы.
// Новый класс вроде `rounded-xl` там просто отсутствует, а сброс полей обнуляет padding и border —
// без явных стилей форма выглядела бы как браузерная (та же ошибка была на /my/login).
import { useFormState, useFormStatus } from 'react-dom';
import {
  LEAD_INITIAL_STATE, LEAD_MESSAGE_MAX, LEAD_NAME_MAX, leadSuccessText,
  type LeadField, type LeadState,
} from '@/lib/lead';
import { submitLead } from '../lead-actions';

const ERROR_TEXT: Readonly<Record<'rate_limited' | 'forbidden' | 'server', string>> = {
  rate_limited: 'С этого адреса уже отправлено 3 заявки за сутки. Напишите нам в Telegram или попробуйте завтра.',
  forbidden: 'Не удалось проверить источник формы. Обновите страницу и отправьте заявку ещё раз.',
  server: 'Не удалось сохранить заявку. Попробуйте ещё раз через минуту или напишите в Telegram.',
};

const field_style: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 48,
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid rgb(var(--color-border, 27 39 64))',
  background: 'rgb(var(--color-bg, 7 11 20))',
  color: 'rgb(var(--color-text, 242 246 255))',
  fontSize: 15,
  lineHeight: 1.4,
  fontFamily: 'inherit',
};

const field_error_style: React.CSSProperties = {
  ...field_style,
  borderColor: 'rgb(var(--color-error, 239 68 68))',
};

function fieldError(state: LeadState, field: LeadField): string | undefined {
  return state.status === 'error' && state.reason === 'validation' ? state.fields[field] : undefined;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-body-sm" disabled={pending} aria-disabled={pending}>
      {pending ? 'Отправляем…' : 'Оставить заявку'}
    </button>
  );
}

export function LeadForm() {
  const [state, action] = useFormState(submitLead, LEAD_INITIAL_STATE);

  // Живые области присутствуют всегда (до ответа пустые): скринридер озвучивает изменения
  // только в уже существующих узлах DOM.
  const status_text = state.status === 'success' ? leadSuccessText() : '';
  const alert_text = alertText(state);

  return (
    <>
      <div role="status" aria-live="polite" data-testid="lead-success" style={status_text ? undefined : { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {status_text && (
          <div className="rounded-2xl border border-brand-border bg-brand-surface p-6 text-left">
            <p className="text-[17px] font-semibold text-brand-text">{status_text}</p>
            <p className="mt-2 text-[14px] leading-6 text-brand-text-muted">
              Если нужен ответ быстрее — напишите в Telegram, контакт в подвале сайта.
            </p>
          </div>
        )}
      </div>
      {state.status !== 'success' && <LeadFields state={state} action={action} alert_text={alert_text} />}
    </>
  );
}

function alertText(state: LeadState): string {
  if (state.status !== 'error') return '';
  if (state.reason === 'validation') return 'Заявка не отправлена: проверьте отмеченные поля.';
  return ERROR_TEXT[state.reason];
}

type FieldsProps = { state: LeadState; action: (form: FormData) => void; alert_text: string };

function LeadFields({ state, action, alert_text }: FieldsProps) {
  const name_error = fieldError(state, 'name');
  const phone_error = fieldError(state, 'phone');
  const email_error = fieldError(state, 'email');
  const message_error = fieldError(state, 'message');
  const consent_error = fieldError(state, 'consent');

  return (
    <form action={action} noValidate className="mt-5 grid gap-4 text-left">
      {/* items-start: иначе колонка с подсказкой выше, и поле «Как вас зовут» растягивалось
          на всю высоту строки — на десктопе оно было вдвое выше соседнего. */}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <label htmlFor="lead-name" className="text-[14px] font-medium text-brand-text">Как вас зовут *</label>
          <input
            id="lead-name" name="name" type="text" autoComplete="name" required maxLength={LEAD_NAME_MAX}
            placeholder="Иван" style={name_error ? field_error_style : field_style}
            aria-invalid={name_error ? true : undefined}
            aria-describedby={name_error ? 'lead-name-error' : undefined}
          />
          {name_error && <p id="lead-name-error" className="text-[13px] text-brand-error">{name_error}</p>}
        </div>

        <div className="grid gap-1">
          <label htmlFor="lead-phone" className="text-[14px] font-medium text-brand-text">Телефон *</label>
          <input
            id="lead-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={40}
            placeholder="+7 999 123-45-67" style={phone_error ? field_error_style : field_style}
            aria-invalid={phone_error ? true : undefined}
            aria-describedby={phone_error ? 'lead-phone-hint lead-phone-error' : 'lead-phone-hint'}
          />
          <p id="lead-phone-hint" className="text-[13px] leading-5 text-brand-text-subtle">Позвоним в рабочее время. Можно указать email вместо телефона.</p>
          {phone_error && <p id="lead-phone-error" className="text-[13px] text-brand-error">{phone_error}</p>}
        </div>
      </div>

      <div className="grid gap-1">
        <label htmlFor="lead-email" className="text-[14px] font-medium text-brand-text">Email</label>
        <input
          id="lead-email" name="email" type="email" autoComplete="email" maxLength={254}
          placeholder="ivan@example.ru" style={email_error ? field_error_style : field_style}
          aria-invalid={email_error ? true : undefined}
          aria-describedby={email_error ? 'lead-email-error' : undefined}
        />
        {email_error && <p id="lead-email-error" className="text-[13px] text-brand-error">{email_error}</p>}
      </div>

      <div className="grid gap-1">
        <label htmlFor="lead-message" className="text-[14px] font-medium text-brand-text">Что за бизнес и какой сайт нужен</label>
        <textarea
          id="lead-message" name="message" rows={3} maxLength={LEAD_MESSAGE_MAX}
          placeholder="Салон красоты в Казани, нужен сайт с записью на услуги"
          style={{ ...(message_error ? field_error_style : field_style), resize: 'vertical', minHeight: 96 }}
          aria-invalid={message_error ? true : undefined}
          aria-describedby={message_error ? 'lead-message-error' : undefined}
        />
        {message_error && <p id="lead-message-error" className="text-[13px] text-brand-error">{message_error}</p>}
      </div>

      <div className="grid gap-1">
        <label htmlFor="lead-consent" className="flex items-start gap-3 text-[13px] leading-5 text-brand-text-muted">
          <input
            id="lead-consent" name="consent" type="checkbox" required
            style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, accentColor: 'rgb(var(--color-accent, 59 130 246))' }}
            aria-invalid={consent_error ? true : undefined}
            aria-describedby={consent_error ? 'lead-consent-error' : undefined}
          />
          <span>
            Согласен на обработку персональных данных в соответствии с{' '}
            <a href="/privacy" className="underline-offset-4" style={{ color: 'rgb(var(--color-text, 242 246 255))', textDecoration: 'underline' }}>политикой</a>{' '}
            и{' '}
            <a href="/oferta" className="underline-offset-4" style={{ color: 'rgb(var(--color-text, 242 246 255))', textDecoration: 'underline' }}>офертой</a>.
          </span>
        </label>
        {consent_error && <p id="lead-consent-error" className="text-[13px] text-brand-error">{consent_error}</p>}
      </div>

      {/* Ловушка для ботов: скрыта от людей и скринридеров, вне порядка табуляции. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }}>
        <label htmlFor="lead-website">Сайт</label>
        <input id="lead-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div role="alert" className="text-[13px] font-semibold text-brand-error" data-testid="lead-error">{alert_text}</div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />
        <p className="text-[13px] text-brand-text-subtle">Без спама: только ответ по вашей заявке.</p>
      </div>
    </form>
  );
}
