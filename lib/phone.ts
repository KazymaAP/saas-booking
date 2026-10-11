// Телефон РФ: нормализация в +7XXXXXXXXXX и маска +7 (___) ___-__-__ (ТЗ §5.2, §0.3).

const PHONE_RE = /^\+7\d{10}$/;

// Возвращает +7XXXXXXXXXX или null, если номер не распознан.
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let ten: string | null = null;
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    ten = digits.slice(1);
  } else if (digits.length === 10) {
    ten = digits;
  }
  if (!ten) return null;
  const normalized = `+7${ten}`;
  return PHONE_RE.test(normalized) ? normalized : null;
}

export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw) !== null;
}

// Маска для поля ввода: принимает любой ввод, выводит +7 (999) 123-45-67.
// Используется в onChange; не валидирует, валидация — normalizePhone.
export function formatPhoneMask(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith('7')) digits = `7${digits}`;
  digits = digits.slice(0, 11);
  const rest = digits.slice(1);
  let out = '+7';
  if (rest.length > 0) out += ` (${rest.slice(0, 3)}`;
  if (rest.length >= 3) out += ')';
  if (rest.length > 3) out += ` ${rest.slice(3, 6)}`;
  if (rest.length > 6) out += `-${rest.slice(6, 8)}`;
  if (rest.length > 8) out += `-${rest.slice(8, 10)}`;
  return out;
}
