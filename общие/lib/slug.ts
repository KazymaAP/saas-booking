// lib/slug.ts — транслит и slug (ТЗ §0.4: «свой словарь транслита в lib/slug.ts»).
// Правила: только a-z0-9-, максимум 60 символов, fallback «business», уникальность через slug + slug_history.

const MAP: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // Украинские и белорусские буквы: встречаются в названиях из 2GIS, иначе выпадали бы целиком.
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g', ў: 'u',
  // Символы, которые несут смысл в названиях: «Шины & Диски» → shiny-i-diski.
  '&': ' i ', '+': ' plus ',
};

export const MAX_SLUG_LENGTH = 60;
export const FALLBACK_SLUG = 'business';
// Предел попыток подбора: защищает БД от тысяч запросов на один slug.
export const MAX_SLUG_ATTEMPTS = 1000;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function transliterate(input: string): string {
  let out = '';
  for (const ch of input.toLowerCase()) {
    out += MAP[ch] ?? ch;
  }
  return out;
}

// Обрезает строку до max символов и убирает висящие дефисы на конце.
function trimSlug(value: string, max: number): string {
  return value.slice(0, max).replace(/-+$/g, '');
}

export function slugify(input: string): string {
  const base = transliterate(input)
    // NFKD раскладывает «é» на «e» + диакритику; диакритика вырезается следующей строкой.
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return trimSlug(base, MAX_SLUG_LENGTH) || FALLBACK_SLUG;
}

// true, если строка уже является корректным slug (для проверки входа из CSV / форм).
export function isValidSlug(value: string): boolean {
  return value.length > 0 && value.length <= MAX_SLUG_LENGTH && SLUG_RE.test(value);
}

// Кандидат с числовым суффиксом: root обрезается так, чтобы «root-N» влез в 60 символов.
export function slugWithSuffix(root: string, n: number): string {
  const suffix = `-${n}`;
  return `${trimSlug(root, MAX_SLUG_LENGTH - suffix.length)}${suffix}`;
}

// Подбирает уникальный slug: base, base-2, base-3 ...
// exists — проверка в БД (true, если slug занят или есть в slug_history другого бизнеса).
export async function ensureUniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base);
  if (!(await exists(root))) return root;
  for (let n = 2; n <= MAX_SLUG_ATTEMPTS; n++) {
    const candidate = slugWithSuffix(root, n);
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`Не удалось подобрать slug для "${base}"`);
}

// Синхронный вариант для пакетного импорта: занятые slug загружены заранее одним запросом.
// Мутирует taken — добавляет выданный slug, чтобы следующий бизнес в пачке его не получил.
export function pickUniqueSlug(base: string, taken: Set<string>): string {
  const root = slugify(base);
  let candidate = root;
  for (let n = 2; taken.has(candidate); n++) {
    if (n > MAX_SLUG_ATTEMPTS) throw new Error(`Не удалось подобрать slug для "${base}"`);
    candidate = slugWithSuffix(root, n);
  }
  taken.add(candidate);
  return candidate;
}
