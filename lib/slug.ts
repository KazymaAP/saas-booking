// Транслит и slug. Свой словарь по ТЗ (§0.3, раздел 0.3 «свой словарь транслита в lib/slug.ts»).

const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export const MAX_SLUG_LENGTH = 60;

export function transliterate(input: string): string {
  let out = '';
  for (const ch of input.toLowerCase()) {
    out += MAP[ch] ?? ch;
  }
  return out;
}

export function slugify(input: string): string {
  const base = transliterate(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return base || 'business';
}

// Подбирает уникальный slug: base, base-2, base-3 ...
// exists — функция проверки в БД (true, если slug занят или есть в slug_history).
export async function ensureUniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base);
  if (!(await exists(root))) return root;
  for (let n = 2; n < 10000; n++) {
    const candidate = `${root.slice(0, MAX_SLUG_LENGTH - String(n).length - 1)}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`Не удалось подобрать slug для "${base}"`);
}
