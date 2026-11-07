// lib/auth-forms.ts — общее для страниц входа, приглашения, magic-link и сброса пароля:
// чтение полей формы, коды ошибок в URL и их тексты. Чистые функции без next/* — покрыты unit-тестами.
// В URL попадает только короткий код ошибки (?error=invalid), никогда — email, пароль или токен.
import {
  MAGIC_LINK_TTL_SECONDS, panelRootOf, RATE_LIMITS, RESET_TTL_SECONDS, sanitizePanelNext, ttlText,
  type AuthRealm,
} from './auth-core';

// Пределы длины полей: защищают от раздутых запросов; пароль режется по байтам в checkPassword.
export const FIELD_MAX = { email: 254, password: 512, confirm: 512, token: 64, next: 512 } as const;
export type FormField = keyof typeof FIELD_MAX;

// Политика Referer для страниц auth. Не 'no-referrer': с ней браузер отправляет форму с Origin: null,
// и Next.js отклоняет Server Action (вход без JavaScript ломается, проверка Origin невозможна).
// 'strict-origin' отдаёт только origin без пути и query — токен из /invite/{token} и ?token= не утекает.
export const AUTH_REFERRER_POLICY = 'strict-origin';

export function formString(form: FormData, field: FormField): string {
  const raw = form.get(field);
  return typeof raw === 'string' ? raw.slice(0, FIELD_MAX[field]) : '';
}

export const AUTH_ERROR_TEXT = {
  invalid: 'Неверная почта или пароль.',
  rate_limited: `Слишком много попыток. Подождите ${ttlText(RATE_LIMITS.login_ip.windowSeconds)} и попробуйте снова.`,
  forbidden_origin: 'Запрос отклонён из соображений безопасности. Обновите страницу и повторите.',
  inactive: 'Кабинет недоступен: подписка не активна. Свяжитесь с поддержкой.',
  invalid_email: 'Введите корректный адрес почты.',
  too_short: 'Пароль слишком короткий: нужно не меньше 8 символов.',
  too_long: 'Пароль слишком длинный: не больше 72 латинских символов.',
  mismatch: 'Пароли не совпадают.',
  wrong_password: 'Для этой почты уже есть учётная запись. Введите её текущий пароль.',
  link_invalid: 'Ссылка недействительна или уже использована. Запросите новую.',
  link_expired: 'Срок действия ссылки истёк. Запросите новую.',
  error: 'Не получилось выполнить действие. Попробуйте ещё раз через минуту.',
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_TEXT;

// Состояние одноразовой ссылки (magic-link, сброс) при открытии → код ошибки страницы.
export const LINK_STATE_ERROR = { expired: 'link_expired', used: 'link_invalid', invalid: 'link_invalid' } as const satisfies Record<string, AuthErrorCode>;

export function isAuthErrorCode(raw: unknown): raw is AuthErrorCode {
  return typeof raw === 'string' && Object.prototype.hasOwnProperty.call(AUTH_ERROR_TEXT, raw);
}

// Текст ошибки по коду из URL. Неизвестный код не отображается (нельзя подсунуть свой текст).
export function errorText(raw: unknown): string | null {
  return isAuthErrorCode(raw) ? AUTH_ERROR_TEXT[raw] : null;
}

export const AUTH_NOTICE_TEXT = {
  expired: 'Сессия истекла. Войдите снова.',
  magic_sent: `Если адрес зарегистрирован, мы отправили на него ссылку для входа. Она действует ${ttlText(MAGIC_LINK_TTL_SECONDS)}.`,
  reset_sent: `Если адрес зарегистрирован, мы отправили на него ссылку для сброса пароля. Она действует ${ttlText(RESET_TTL_SECONDS)}.`,
  password_changed: 'Пароль изменён. Войдите с новым паролем.',
  logged_out: 'Вы вышли из кабинета.',
} as const;

export type AuthNoticeCode = keyof typeof AUTH_NOTICE_TEXT;

function isNoticeCode(raw: unknown): raw is AuthNoticeCode {
  return typeof raw === 'string' && Object.prototype.hasOwnProperty.call(AUTH_NOTICE_TEXT, raw);
}

export function noticeText(raw: unknown): string | null {
  return isNoticeCode(raw) ? AUTH_NOTICE_TEXT[raw] : null;
}

// Путь с query-параметрами; пустые значения пропускаются.
export function withQuery(path: string, params: Readonly<Record<string, string | null | undefined>>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) q.set(key, value);
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

// Область входа по пути возврата: кабинет владельца (/{prefix}/{slug}/panel...) или супер-админка.
// Используется страницами /magic-link и /panel/forgot-password, которые общие для обеих областей.
export function realmFromNext(raw: unknown): { realm: AuthRealm; next: string | null } {
  const next = sanitizePanelNext(raw);
  if (!next) return { realm: 'admin', next: null };
  const root = panelRootOf(next.split(/[?#]/)[0] ?? '');
  return { realm: root && root !== '/panel' ? 'owner' : 'admin', next };
}

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

// Первое значение параметра из searchParams страницы (Next.js отдаёт массив при повторе ключа).
export function param(searchParams: SearchParams, key: string): string | null {
  const v = searchParams[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}
