// bookings/tel.ts — ссылка «позвонить» для карточки брони. Чистый модуль: импортируется клиентским BookingList,
// поэтому лежит отдельно от rows.ts (тот нужен только серверу).
// Ссылка tel: — только цифры и ведущий «+». Телефоны из старых броней и импорта 2ГИС бывают
// в виде «+7 (999) 123-45-67» или «8 999 …»: пробелы и скобки в tel: часть телефонов набирает с ошибкой.
export function telHref(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 5) return null;
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}
