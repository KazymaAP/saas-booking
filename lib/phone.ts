// Телефон РФ: нормализация в +7XXXXXXXXXX и маска +7 (___) ___-__-__ (ТЗ §0.4: свой regex, своя маска).
// Чистые функции без зависимостей — используются и в браузере (маска), и на сервере (валидация, логи).

// Нормализованный вид телефона в БД.
export const NORMALIZED_PHONE_RE = /^\+7\d{10}$/;
const NATIONAL_LENGTH = 10; // цифр после кода страны
const FULL_LENGTH = 11; // 7 + 10 цифр
const COUNTRY_CODE = '7';
const TRUNK_PREFIX = '8'; // «8» вместо «+7» в российской записи
// Коды зон РФ/Казахстана не начинаются с 0, 1, 2 — такие номера заведомо ошибочны.
const INVALID_FIRST_DIGIT = /^[012]/;
const VISIBLE_TAIL = 4; // сколько последних цифр видно в логах

function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

// Возвращает +7XXXXXXXXXX или null, если номер не распознан.
export function normalizePhone(raw: string): string | null {
  const digits = onlyDigits(raw);
  let national: string | null = null;
  if (digits.length === FULL_LENGTH && (digits[0] === COUNTRY_CODE || digits[0] === TRUNK_PREFIX)) {
    national = digits.slice(1);
  } else if (digits.length === NATIONAL_LENGTH) {
    national = digits;
  }
  if (national === null || INVALID_FIRST_DIGIT.test(national)) return null;
  // national — ровно 10 цифр (проверено длиной), поэтому результат всегда матчится NORMALIZED_PHONE_RE.
  return `+7${national}`;
}

export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw) !== null;
}

// Маска для поля ввода: принимает любой ввод, выводит +7 (999) 123-45-67.
// Используется в onChange; не валидирует, валидация — normalizePhone.
// Закрывающая скобка ставится только после 4-й цифры: иначе Backspace по «)» «залипает»
// (маска возвращала бы скобку обратно и пользователь не мог стереть код).
export function formatPhoneMask(raw: string): string {
  let digits = onlyDigits(raw);
  if (digits.startsWith(TRUNK_PREFIX)) digits = `${COUNTRY_CODE}${digits.slice(1)}`;
  if (digits.startsWith(COUNTRY_CODE) === false) digits = `${COUNTRY_CODE}${digits}`;
  const rest = digits.slice(1, FULL_LENGTH);
  let out = '+7';
  if (rest.length > 0) out += ` (${rest.slice(0, 3)}`;
  if (rest.length > 3) out += `) ${rest.slice(3, 6)}`;
  if (rest.length > 6) out += `-${rest.slice(6, 8)}`;
  if (rest.length > 8) out += `-${rest.slice(8, 10)}`;
  return out;
}

// Маскирует телефон для логов (ТЗ: логи без PII): +7******4567. Пустое/мусор → '***'.
export function maskPhone(raw: string | null | undefined): string {
  const digits = onlyDigits(raw ?? '');
  if (digits.length <= VISIBLE_TAIL) return '***';
  return `+${'*'.repeat(digits.length - VISIBLE_TAIL)}${digits.slice(-VISIBLE_TAIL)}`;
}
