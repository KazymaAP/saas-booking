'use client';
// app/data-request/DataRequestForm.tsx — форма запроса субъекта ПД.
// 'use client': useFormState/useFormStatus для ответа без перезагрузки и мгновенной блокировки кнопки (optimistic UI).
// Без JS форма тоже работает: server action принимает обычный POST.
import { useFormState, useFormStatus } from 'react-dom';
import {
  DATA_REQUEST_BUSINESS_MAX, DATA_REQUEST_INITIAL_STATE, DATA_REQUEST_TEXT_MAX, DATA_REQUEST_TYPES, DATA_REQUEST_TYPE_LABELS,
  dataRequestSuccessText, type DataRequestField, type DataRequestState,
} from '@/lib/data-request';
import { submitDataRequest } from './actions';

const ERROR_TEXT: Readonly<Record<'rate_limited' | 'forbidden' | 'server', string>> = {
  rate_limited: 'С этого адреса уже отправлено 3 запроса за сутки. Попробуйте завтра или напишите на email из раздела «Контакты».',
  forbidden: 'Не удалось проверить источник формы. Обновите страницу и отправьте запрос ещё раз.',
  server: 'Не удалось сохранить запрос. Попробуйте позже или напишите на email из раздела «Контакты» — срок ответа не изменится.',
};

function fieldError(state: DataRequestState, field: DataRequestField): string | undefined {
  return state.status === 'error' && state.reason === 'validation' ? state.fields[field] : undefined;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary min-h-[44px] justify-self-start" disabled={pending} aria-disabled={pending}>
      {pending ? 'Отправляем…' : 'Отправить запрос'}
    </button>
  );
}

export function DataRequestForm() {
  const [state, action] = useFormState(submitDataRequest, DATA_REQUEST_INITIAL_STATE);

  // Живые области существуют всегда (до ответа пустые): скринридеры надёжно озвучивают изменения только
  // в уже присутствующих в DOM областях.
  const status_text = state.status === 'success' ? dataRequestSuccessText(state.type) : '';
  const alert_text = alertText(state);

  return (
    <>
      <div role="status" aria-live="polite" data-testid="data-request-success" className={status_text ? 'mt-6 rounded-md border border-[#e5e5e5] bg-[#f6f6f6] p-4' : 'sr-only'}>
        {status_text && (
          <>
            <p className="font-semibold">{status_text}</p>
            <p className="mt-2 text-[14px]">Если ответ не придёт, проверьте папку «Спам» или повторите запрос по email.</p>
          </>
        )}
      </div>
      {state.status !== 'success' && <RequestFields state={state} action={action} alert_text={alert_text} />}
    </>
  );
}

function alertText(state: DataRequestState): string {
  if (state.status !== 'error') return '';
  if (state.reason === 'validation') return 'Запрос не отправлен: исправьте отмеченные поля.';
  return ERROR_TEXT[state.reason];
}

type FieldsProps = { state: DataRequestState; action: (form: FormData) => void; alert_text: string };

function RequestFields({ state, action, alert_text }: FieldsProps) {
  const email_error = fieldError(state, 'email');
  const type_error = fieldError(state, 'type');
  const text_error = fieldError(state, 'request_text');
  const business_error = fieldError(state, 'business');

  return (
    <form action={action} noValidate className="mt-6 grid gap-5" aria-describedby="data-request-note">
      <p id="data-request-note" className="text-[14px] text-[#595959]">Поля со звёздочкой обязательны.</p>

      <div className="grid gap-1">
        <label htmlFor="dr-email" className="font-semibold">Email для ответа *</label>
        <input
          id="dr-email" name="email" type="email" autoComplete="email" required maxLength={254} className="input"
          aria-invalid={email_error ? true : undefined} aria-describedby={email_error ? 'dr-email-hint dr-email-error' : 'dr-email-hint'}
        />
        <p id="dr-email-hint" className="text-[14px] text-[#595959]">Тот, который вы указывали при записи или на который получали письма.</p>
        {email_error && <p id="dr-email-error" className="text-[14px] text-[#b91c1c]">{email_error}</p>}
      </div>

      <fieldset className="grid gap-2" aria-describedby={type_error ? 'dr-type-error' : undefined} aria-invalid={type_error ? true : undefined}>
        <legend className="font-semibold">Что нужно сделать *</legend>
        {DATA_REQUEST_TYPES.map((type, index) => (
          <label key={type} className="flex min-h-[44px] items-center gap-3">
            <input type="radio" name="type" value={type} required defaultChecked={index === 0} className="h-5 w-5" />
            <span>{DATA_REQUEST_TYPE_LABELS[type]}</span>
          </label>
        ))}
        {type_error && <p id="dr-type-error" className="text-[14px] text-[#b91c1c]">{type_error}</p>}
      </fieldset>

      <div className="grid gap-1">
        <label htmlFor="dr-business" className="font-semibold">Бизнес, к которому вы записывались</label>
        <input
          id="dr-business" name="business" type="text" maxLength={DATA_REQUEST_BUSINESS_MAX} className="input"
          aria-invalid={business_error ? true : undefined} aria-describedby={business_error ? 'dr-business-hint dr-business-error' : 'dr-business-hint'}
        />
        <p id="dr-business-hint" className="text-[14px] text-[#595959]">Название или адрес сайта записи. Поможет быстрее найти данные.</p>
        {business_error && <p id="dr-business-error" className="text-[14px] text-[#b91c1c]">{business_error}</p>}
      </div>

      <div className="grid gap-1">
        <label htmlFor="dr-text" className="font-semibold">Описание запроса</label>
        <textarea
          id="dr-text" name="request_text" rows={5} maxLength={DATA_REQUEST_TEXT_MAX} className="input"
          aria-invalid={text_error ? true : undefined} aria-describedby={text_error ? 'dr-text-hint dr-text-error' : 'dr-text-hint'}
        />
        <p id="dr-text-hint" className="text-[14px] text-[#595959]">
          Обязательно для «узнать» и «исправить»: что именно и какие данные верные. Не указывайте паспортные данные и сведения о здоровье.
        </p>
        {text_error && <p id="dr-text-error" className="text-[14px] text-[#b91c1c]">{text_error}</p>}
      </div>

      {/* Ловушка для ботов: скрыта от людей и скринридеров, не попадает в порядок табуляции. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="dr-website">Сайт</label>
        <input id="dr-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div role="alert" className="text-[14px] font-semibold text-[#b91c1c]" data-testid="data-request-error">{alert_text}</div>

      <SubmitButton />
    </form>
  );
}
