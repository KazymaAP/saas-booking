// app/panel/(protected)/verticals/schema.ts — zod-схемы ниш (ТЗ §4.5). Общие для формы, импорта, экспорта и тестов.
// Раньше импорт делал upsert произвольного объекта (можно было записать id, created_at, любые поля),
// а JSON-поля формы проверялись только на синтаксис. Теперь проверяется структура каждого поля.
import { z } from 'zod';

// Первые сегменты URL, занятые маршрутами приложения: ниша с таким префиксом перекрыла бы их.
export const RESERVED_PREFIXES = ['api', 'panel', 'preview', 'booking', 'blocked', 'oferta', 'privacy', 'static', 'next', 'sw'] as const;

export const MAX_SERVICES = 50;
export const MAX_FIELDS = 30;
export const MAX_IMPORT = 100;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KEY_RE = /^[a-z][a-z0-9_]*$/;

const text = (max: number) => z.string().trim().max(max, `Не длиннее ${max} символов`);
const optionalText = (max: number) => text(max).nullish().transform((v) => v || null);

export const serviceSchema = z.object({
  name: text(120).min(1, 'Название услуги обязательно'),
  price: z.number({ invalid_type_error: 'Цена — число' }).int('Цена — целое число').min(0, 'Цена не меньше 0').max(1_000_000, 'Цена до 1 000 000'),
  duration: z.number({ invalid_type_error: 'Длительность — число' }).int().min(5, 'От 5 минут').max(1440, 'До 24 часов'),
});

export const fieldDefSchema = z.object({
  key: z.string().regex(KEY_RE, 'key: латиница в нижнем регистре, цифры, _'),
  label: text(80).min(1),
  type: z.enum(['text', 'textarea', 'number', 'select', 'checkbox', 'phone', 'url']),
  options: z.array(text(80)).max(50).optional(),
  required: z.boolean().optional(),
});

// ТЗ §4.5: default_texts {hero_title, hero_subtitle, cta}; допускаются и другие ключи текстов шаблона.
export const textsSchema = z.record(z.string().regex(KEY_RE, 'Ключ текста: латиница, цифры, _'), text(2000)).refine((o) => Object.keys(o).length <= 50, 'Не больше 50 текстов');
export const colorsSchema = z.object({ primary: z.string().regex(HEX_RE).optional(), secondary: z.string().regex(HEX_RE).optional(), bg: z.string().regex(HEX_RE).optional() }).strict();
export const blocksSchema = z.object({ show_map: z.boolean().optional(), show_gallery: z.boolean().optional(), show_reviews: z.boolean().optional(), show_demo_mode: z.boolean().optional() }).strict();

export const verticalSchema = z.object({
  name: text(80).min(2, 'Минимум 2 символа'),
  slug: z.string().trim().toLowerCase().min(2, 'Минимум 2 символа').max(40, 'Не длиннее 40').regex(SLUG_RE, 'Латиница, цифры и дефис'),
  url_prefix: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]{1,4}$/, '1–4 символа: латиница и цифры')
    .refine((v) => !(RESERVED_PREFIXES as readonly string[]).includes(v), 'Префикс занят системным адресом'),
  icon: optionalText(8),
  description: optionalText(300),
  fields: z.array(fieldDefSchema).max(MAX_FIELDS, `Не больше ${MAX_FIELDS} полей`).default([]),
  default_services: z.array(serviceSchema).max(MAX_SERVICES, `Не больше ${MAX_SERVICES} услуг`).default([]),
  default_texts: textsSchema.default({}),
  default_colors: colorsSchema.default({}),
  blocks: blocksSchema.default({}),
  show_demo_mode: z.boolean().default(true),
  is_active: z.boolean().default(true),
});

export type VerticalInput = z.infer<typeof verticalSchema>;

// Поля JSON в форме — по одному textarea на каждое.
export const JSON_FIELDS = ['default_services', 'default_texts', 'default_colors', 'blocks', 'fields'] as const;
export type JsonField = (typeof JSON_FIELDS)[number];

export const JSON_HINT: Record<JsonField, string> = {
  default_services: '[{"name":"Стрижка","price":1500,"duration":60}]',
  default_texts: '{"hero_title":"{name}","hero_subtitle":"Запись онлайн","cta":"Записаться"}',
  default_colors: '{"primary":"#111111","secondary":"#666666","bg":"#ffffff"}',
  blocks: '{"show_map":true,"show_gallery":true,"show_reviews":false}',
  fields: '[{"key":"car_brand","label":"Марка авто","type":"text","required":false}]',
};

export const JSON_EMPTY: Record<JsonField, string> = { default_services: '[]', default_texts: '{}', default_colors: '{}', blocks: '{}', fields: '[]' };

// JSON.parse без исключения: { ok, value } или текст ошибки для поля.
export function parseJsonSafe(raw: string, empty: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw.trim() || empty) };
  } catch (e) {
    return { ok: false, error: `Ошибка JSON: ${e instanceof Error ? e.message : 'не разобрать'}` };
  }
}

// Путь ошибки zod → «default_services[2].price: Цена не меньше 0».
export function issuePath(issue: z.ZodIssue): string {
  return issue.path.reduce<string>((acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${p}` : String(p)), '');
}

export type ImportReport = { valid: VerticalInput[]; errors: string[] };

// Импорт: каждая ниша проверяется отдельно, ошибки собираются в отчёт (сколько принято, что не так с остальными).
// Повтор slug или url_prefix внутри файла — ошибка (иначе upsert молча перезапишет первую запись второй).
export function validateImport(raw: unknown): ImportReport {
  if (!Array.isArray(raw)) return { valid: [], errors: ['Нужен массив ниш — как в скачанном файле'] };
  const list: unknown[] = raw;
  if (list.length > MAX_IMPORT) return { valid: [], errors: [`Не больше ${MAX_IMPORT} ниш за раз`] };
  const valid: VerticalInput[] = [];
  const errors: string[] = [];
  const slugs = new Set<string>();
  const prefixes = new Set<string>();
  list.forEach((item, i) => {
    const r = verticalSchema.safeParse(item);
    if (!r.success) {
      const first = r.error.issues[0];
      errors.push(`№${i + 1}: ${first ? `${issuePath(first)} — ${first.message}` : 'неверный формат'}`);
      return;
    }
    if (slugs.has(r.data.slug) || prefixes.has(r.data.url_prefix)) {
      errors.push(`№${i + 1}: повтор slug или префикса в файле (${r.data.slug} /${r.data.url_prefix})`);
      return;
    }
    slugs.add(r.data.slug);
    prefixes.add(r.data.url_prefix);
    valid.push(r.data);
  });
  return { valid, errors };
}
