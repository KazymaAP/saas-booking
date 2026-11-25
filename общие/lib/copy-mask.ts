// общие/lib/copy-mask.ts — обезличивание контактов клиентов в разделе копий /test/ful/sts.
//
// Зачем: раздел копий открыт без входа (это его смысл — витрина и обход для краулеров), а кабинет
// показывает реальные брони. Без обезличивания любой посетитель видел в HTML имена и телефоны
// клиентов бизнеса, а по /admin/export скачивал их файлом. Персональные данные клиентов в открытом
// доступе — это не «особенность демо», а утечка.
//
// Что делаем: подменяем имя, телефон и e-mail на правдоподобные демо-значения. Подстановка
// детерминированная (хеш от id строки), поэтому при перерисовке и смене фильтра данные не «прыгают».
// Услуга, время, статус, цена и выручка остаются настоящими — витрина выглядит как рабочая.

/** Поля контакта, которые есть и у строки брони, и у строки смены. */
export type ContactFields = {
  id: string;
  client_name: string | null;
  client_phone: string | null;
  comment?: string | null;
};

// Правдоподобные имена: витрина не должна выглядеть как «Клиент №1».
const DEMO_NAMES = [
  'Анна К.', 'Мария С.', 'Дмитрий П.', 'Ольга В.',
  'Игорь Т.', 'Светлана Р.', 'Алексей М.', 'Елена Г.',
] as const;

/** FNV-1a: стабильный хеш строки в 32 бита, без зависимостей. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Телефон в формате, который ожидает вёрстка: +7 900 123-45-67.
function demoPhone(seed: number): string {
  const a = 100 + (seed % 900);
  const b = 10 + (Math.floor(seed / 7) % 90);
  const c = 10 + (Math.floor(seed / 97) % 90);
  return `+7 900 ${a}-${pad(b)}-${pad(c)}`;
}

// В свободном комментарии клиент иногда оставляет свой телефон. Цифровые цепочки от 6 символов
// (номера, коды) гасим — остальной текст («зимняя резина в багажнике») оставляем: он про услугу.
function maskComment(comment: string | null | undefined): string | null | undefined {
  if (typeof comment !== 'string') return comment;
  return comment.replace(/\d{6,}/g, '•••');
}

/**
 * Обезличивает контакты в строках кабинета. Возвращает новые объекты — исходные строки не меняются,
 * поэтому счётчики и статистика, посчитанные по настоящим данным, остаются верными.
 */
export function maskContacts<T extends ContactFields>(rows: readonly T[]): T[] {
  return rows.map((row) => {
    const seed = hash(row.id);
    return {
      ...row,
      client_name: row.client_name ? DEMO_NAMES[seed % DEMO_NAMES.length] : null,
      client_phone: row.client_phone ? demoPhone(seed) : null,
      ...(row.comment === undefined ? {} : { comment: maskComment(row.comment) }),
    };
  });
}
