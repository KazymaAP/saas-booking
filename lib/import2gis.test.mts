// lib/import2gis.test.ts — импорт 2GIS (Vitest). БД заменена in-memory хранилищем с семантикой ON CONFLICT.
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { ImportError, MAX_ROWS, importRows, normalize2gisUrl, normalizeAddress, normalizeEmail, normalizeWebsite, parseWorkbook, verticalFor, type Row } from './import2gis';
import { dedupeCandidates, detectColumns, normalizeSocial, parseRow, type Candidate } from './import2gis-parse';
import { chunkForFilter, MAX_FILTER_CHARS, type ExistingBusiness, type ImportStore, type NewBusiness, type SafePatch, type StoreError } from './import2gis-store';

type Stored = ExistingBusiness & { slug_history: string[]; vertical_template_id: string | null; city: string | null; category: string | null };

class MemoryStore implements ImportStore {
  rows: Stored[] = [];
  calls = { insert: 0, update: 0, find: 0 };
  failInsert: StoreError[] = [];
  // Вызывается перед каждой вставкой: имитация параллельного импорта, который успел что-то записать.
  beforeInsert: (() => void) | null = null;

  async loadTemplates() {
    return new Map([['tire-service', 'tpl-tire'], ['detailing', 'tpl-det']]);
  }
  async findExisting(urls: readonly string[], phones: readonly string[]) {
    this.calls.find++;
    return this.rows.filter((r) => (r.source_2gis_url && urls.includes(r.source_2gis_url)) || (r.phones ?? []).some((p) => phones.includes(p)));
  }
  async loadTakenSlugs(roots: readonly string[]) {
    return new Set(this.rows.map((r) => r.slug).filter((s) => roots.some((root) => s.startsWith(root))));
  }
  async findSlugConflicts(candidates: readonly string[]) {
    return new Set(candidates.filter((c) => this.rows.some((r) => r.slug === c || r.slug_history.includes(c))));
  }
  async insertBatch(batch: readonly NewBusiness[], column: 'source_2gis_url' | 'slug') {
    this.calls.insert++;
    const err = this.failInsert.shift();
    if (err) return { written: 0, error: err };
    this.beforeInsert?.();
    this.beforeInsert = null;
    const fresh = batch.filter((b) => {
      const value = b[column];
      return !(value && this.rows.some((r) => r[column] === value)); // ON CONFLICT DO NOTHING
    });
    // Как в Postgres: конфликт по другому уникальному полю (slug) не гасится и откатывает весь INSERT.
    if (fresh.some((b) => this.rows.some((r) => r.slug === b.slug))) return { written: 0, error: { message: 'duplicate key businesses_slug_key', code: '23505' } };
    for (const b of fresh) this.rows.push({ ...b, id: `id-${this.rows.length + 1}`, slug_history: [] });
    return { written: fresh.length, error: null };
  }
  async updateBatch(batch: readonly SafePatch[]) {
    this.calls.update++;
    for (const p of batch) {
      const i = this.rows.findIndex((r) => r.id === p.id);
      if (i >= 0) this.rows[i] = { ...this.rows[i], ...p };
    }
    return { written: batch.length, error: null };
  }
}

const row = (over: Partial<Record<string, string>> = {}): Row => ({
  Наименование: 'Шина Плюс', Рубрики: 'Шиномонтаж', Адрес: 'Селькоровская улица, 11', Город: 'Екатеринбург',
  Рейтинг: '4,5', 'Количество отзывов': '12', Телефон: '89089240660 (шиномонтаж)', 'E-mail': '',
  'Веб-сайт': '', WhatsApp: '', Telegram: '', '2GIS URL': 'https://2gis.com/firm/1', ...over,
});

function workbook(rows: Row[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

const cols = detectColumns([row()]);
function candidate(over: Partial<Record<string, string>> = {}): Candidate {
  const r = parseRow(row(over), cols);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('нормализация', () => {
  it('email: регистр, mailto, мусор', () => {
    expect(normalizeEmail(' MAILTO:Info@Shina.RU ')).toBe('info@shina.ru');
    expect(normalizeEmail('не email')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
  });

  it('сайт: host без www, приватные отбрасываются', () => {
    expect(normalizeWebsite('http://www.Shina.ru/catalog')).toBe('shina.ru');
    expect(normalizeWebsite('shina.ru')).toBe('shina.ru');
    expect(normalizeWebsite('http://127.0.0.1/')).toBeNull();
    expect(normalizeWebsite('javascript:alert(1)')).toBeNull();
  });

  it('2GIS URL: только домены 2gis, без query и хвостового /', () => {
    expect(normalize2gisUrl('https://2gis.com/firm/123/?m=60.6')).toBe('https://2gis.com/firm/123');
    expect(normalize2gisUrl('2gis.ru/ekaterinburg/firm/7')).toBe('https://2gis.ru/ekaterinburg/firm/7');
    expect(normalize2gisUrl('https://evil.com/firm/1')).toBeNull();
    expect(normalize2gisUrl('')).toBeNull();
  });

  it('адрес: регистр, ё, «улица»/«ул.», пунктуация', () => {
    expect(normalizeAddress('Селькоровская улица, 11')).toBe(normalizeAddress('селькоровская ул. 11'));
    expect(normalizeAddress('Ёлочная, 1')).toBe('елочная 1');
  });

  it('адрес: «д.», «пр-т», «корп.» и границы кириллических слов', () => {
    expect(normalizeAddress('проспект Ленина, д. 5, корпус 2')).toBe(normalizeAddress('пр-т Ленина 5 к2'));
    // «Уральская» начинается с «ул»-подобных букв не на границе слова — не должна портиться.
    expect(normalizeAddress('Уральская 3')).toBe('уральская 3');
    expect(normalizeAddress('Дорожная 1')).toBe('дорожная 1');
  });

  it('мессенджеры: только официальные хосты', () => {
    expect(normalizeSocial('https://wa.me/79089240660', 'whatsapp')).toBe('https://wa.me/79089240660');
    expect(normalizeSocial('t.me/shina', 'telegram')).toBe('https://t.me/shina');
    expect(normalizeSocial('https://phish.ru/wa', 'whatsapp')).toBeNull();
    expect(normalizeSocial('javascript:alert(1)', 'telegram')).toBeNull();
  });

  it('ниша по первой подходящей рубрике', () => {
    expect(verticalFor('Шиномонтаж; Автомойки')).toBe('tire-service');
    expect(verticalFor('Автомойки; Шиномонтаж')).toBe('detailing');
    expect(verticalFor('Цветы')).toBeNull();
  });
});

describe('parseRow (Zod)', () => {
  it('телефоны через lib/phone, без комментариев, без дублей', () => {
    const c = candidate({ Телефон: '89089240660 (отдел); +7 908 924-06-60, 8 (343) 111-22-33' });
    expect(c.phones).toEqual(['+79089240660', '+73431112233']);
  });

  it('код города в скобках сохраняется, текстовый комментарий вырезается', () => {
    expect(candidate({ Телефон: '8 (343) 111-22-33 (ресепшен)' }).phones).toEqual(['+73431112233']);
  });

  it('мусорный телефон отбрасывается, строка остаётся валидной', () => {
    expect(candidate({ Телефон: '123; abc' }).phones).toEqual([]);
  });

  it('рейтинг с запятой и отзывы — числа', () => {
    const c = candidate();
    expect(c.rating).toBe(4.5);
    expect(c.reviews_count).toBe(12);
  });

  it('строка без названия невалидна', () => {
    const r = parseRow(row({ Наименование: '   ' }), cols);
    expect(r.ok).toBe(false);
  });

  it('рейтинг вне 0..5 невалиден', () => {
    expect(parseRow(row({ Рейтинг: '55' }), cols).ok).toBe(false);
  });
});

describe('parseWorkbook', () => {
  it('читает первый лист', () => {
    expect(parseWorkbook(workbook([row(), row()]))).toHaveLength(2);
  });

  it('пустой файл, пустой лист, нет колонок — ImportError', () => {
    const reason = (data: Uint8Array) => {
      try { parseWorkbook(data); return 'ok'; } catch (e) { return e instanceof ImportError ? e.reason : 'other'; }
    };
    expect(reason(new Uint8Array())).toBe('empty');
    expect(reason(workbook([]))).toBe('empty');
    expect(reason(workbook([{ Колонка: 'x' }]))).toBe('headers');
    expect(reason(new Uint8Array(11 * 1024 * 1024))).toBe('too_large');
  });

  it('больше MAX_ROWS строк — отказ', () => {
    const many = Array.from({ length: MAX_ROWS + 5 }, (_, i) => ({ Наименование: `n${i}`, Рубрики: 'шин' }));
    expect(() => parseWorkbook(workbook(many))).toThrow(ImportError);
  });
});

describe('dedupeCandidates', () => {
  it('дубль по 2GIS URL сливается с объединением контактов', () => {
    const { unique, duplicates } = dedupeCandidates([candidate(), candidate({ 'E-mail': 'a@shina.ru', Телефон: '' })]);
    expect(duplicates).toBe(1);
    expect(unique).toHaveLength(1);
    expect(unique[0].emails).toEqual(['a@shina.ru']);
  });

  it('без 2GIS URL — дубль по телефону + адресу', () => {
    const a = candidate({ '2GIS URL': '' });
    const b = candidate({ '2GIS URL': '', Адрес: 'селькоровская ул. 11' });
    expect(dedupeCandidates([a, b]).duplicates).toBe(1);
  });

  it('тот же телефон и адрес, но разные 2GIS URL — разные филиалы', () => {
    const a = candidate();
    const b = candidate({ '2GIS URL': 'https://2gis.com/firm/2' });
    expect(dedupeCandidates([a, b]).unique).toHaveLength(2);
  });
});

describe('importRows', () => {
  it('создаёт записи, статус по наличию email, нишу по рубрике', async () => {
    const store = new MemoryStore();
    const stats = await importRows(store, [row(), row({ '2GIS URL': 'https://2gis.com/firm/2', Наименование: 'Мойка', Рубрики: 'Шиномонтаж; Автомойки', 'E-mail': 'x@y.ru', Телефон: '89000000001' })]);
    expect(stats).toMatchObject({ total: 2, selected: 2, created: 2, updated: 0, withEmail: 1 });
    expect(store.rows.map((r) => r.status)).toEqual(['no_contact', 'new']);
    expect(store.rows[0].vertical_template_id).toBe('tpl-tire');
  });

  it('фильтр по рубрике без учёта регистра', async () => {
    const stats = await importRows(new MemoryStore(), [row(), row({ Рубрики: 'Цветы', '2GIS URL': 'https://2gis.com/firm/9' })], { filter: 'ШИН' });
    expect(stats.selected).toBe(1);
  });

  it('dry-run не пишет в БД', async () => {
    const store = new MemoryStore();
    const stats = await importRows(store, [row({ 'E-mail': 'a@b.ru' })], { dryRun: true });
    expect(stats).toMatchObject({ dryRun: true, selected: 1, withEmail: 1, created: 0 });
    expect(store.calls.find + store.calls.insert).toBe(0);
  });

  it('повторный импорт идемпотентен: не создаёт дублей и не трогает name/slug', async () => {
    const store = new MemoryStore();
    await importRows(store, [row()]);
    store.rows[0].name = 'Переименовано владельцем';
    const second = await importRows(store, [row({ Рейтинг: '4.9', 'E-mail': 'new@shina.ru' })]);
    expect(second).toMatchObject({ created: 0, updated: 1 });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ name: 'Переименовано владельцем', slug: 'shina-plyus', rating: 4.9, emails: ['new@shina.ru'], status: 'new' });
    const third = await importRows(store, [row({ Рейтинг: '4.9', 'E-mail': 'new@shina.ru' })]);
    expect(third).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
  });

  it('совпадение по телефону + адресу без 2GIS URL', async () => {
    const store = new MemoryStore();
    await importRows(store, [row({ '2GIS URL': '' })]);
    const stats = await importRows(store, [row({ '2GIS URL': '', Адрес: 'Селькоровская ул., 11', Рейтинг: '3' })]);
    expect(stats).toMatchObject({ created: 0, updated: 1 });
  });

  it('одинаковые названия получают разные slug, занятые и из slug_history пропускаются', async () => {
    const store = new MemoryStore();
    store.rows.push({ id: 'old', name: 'x', slug: 'shina-plyus', slug_history: ['shina-plyus-2'], status: 'client', address: null, phones: [], emails: [], websites: [], socials: null, rating: null, reviews_count: null, source_2gis_url: null, vertical_template_id: null, city: null, category: null });
    await importRows(store, [row(), row({ '2GIS URL': 'https://2gis.com/firm/2', Телефон: '89000000002' })]);
    expect(store.rows.slice(1).map((r) => r.slug)).toEqual(['shina-plyus-3', 'shina-plyus-4']);
  });

  it('невалидные строки пропускаются с номером строки в ошибке', async () => {
    const stats = await importRows(new MemoryStore(), [row(), row({ Наименование: '', '2GIS URL': 'https://2gis.com/firm/5' })]);
    expect(stats).toMatchObject({ created: 1, invalid: 1, skipped: 1 });
    expect(stats.errors[0]).toMatch(/^Строка 3:/);
  });

  it('пачки по 100: 250 строк = 3 вставки', async () => {
    const store = new MemoryStore();
    const rows = Array.from({ length: 250 }, (_, i) => row({ Наименование: `Шина ${i}`, '2GIS URL': `https://2gis.com/firm/${i}`, Телефон: `8900${String(i).padStart(7, '0')}` }));
    const stats = await importRows(store, rows);
    expect(stats.created).toBe(250);
    expect(store.calls.insert).toBe(3);
  });

  it('временная ошибка батча — retry, ошибка данных — без повторов', async () => {
    const store = new MemoryStore();
    store.failInsert = [{ message: 'timeout', code: '57014' }];
    expect((await importRows(store, [row()])).created).toBe(1);
    const strict = new MemoryStore();
    strict.failInsert = [{ message: 'violates check', code: '23514' }];
    const stats = await importRows(strict, [row()]);
    expect(stats.created).toBe(0);
    expect(strict.calls.insert).toBe(1);
    expect(stats.errors[0]).toMatch(/violates check/);
  });

  it('нет уникального индекса под ON CONFLICT — откат на конфликт по slug', async () => {
    const store = new MemoryStore();
    store.failInsert = [{ message: 'no unique constraint', code: '42P10' }];
    expect((await importRows(store, [row()])).created).toBe(1);
  });

  it('1000 строк укладываются в лимит времени', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => row({ Наименование: `Шина ${i % 50}`, '2GIS URL': `https://2gis.com/firm/${i}`, Телефон: `8901${String(i).padStart(7, '0')}` }));
    const stats = await importRows(new MemoryStore(), rows);
    expect(stats.created).toBe(1000);
    expect(stats.durationMs).toBeLessThan(5000);
  });

  it('параллельный импорт занял slug — slug переподбирается, запись создаётся', async () => {
    const store = new MemoryStore();
    store.beforeInsert = () => store.rows.push({ ...store.rows[0], id: 'other', name: 'Шина Плюс', slug: 'shina-plyus', slug_history: [], source_2gis_url: 'https://2gis.com/firm/999', phones: [], emails: [], websites: [], socials: null, address: null, status: 'new', rating: null, reviews_count: null, vertical_template_id: null, city: null, category: null });
    const rows = [row(), row({ Наименование: 'Колесо', '2GIS URL': 'https://2gis.com/firm/2', Телефон: '89000000002' }), row({ Наименование: 'Диск', '2GIS URL': 'https://2gis.com/firm/3', Телефон: '89000000003' })];
    const stats = await importRows(store, rows);
    expect(stats.errors).toEqual([]);
    expect(stats.created).toBe(3);
    // Переподбор только у конфликтной строки, соседи по пачке slug не меняют.
    expect(store.rows.map((r) => r.slug).sort()).toEqual(['disk', 'koleso', 'shina-plyus', 'shina-plyus-2']);
  });

  it('параллельный импорт создал ту же фирму — не дубль и не ошибка, а «без изменений»', async () => {
    const store = new MemoryStore();
    store.beforeInsert = () => store.rows.push({ id: 'other', name: 'Шина Плюс', slug: 'shina-plyus-x', slug_history: [], source_2gis_url: 'https://2gis.com/firm/1', phones: [], emails: [], websites: [], socials: null, address: null, status: 'new', rating: null, reviews_count: null, vertical_template_id: null, city: null, category: null });
    const stats = await importRows(store, [row()]);
    expect(stats).toMatchObject({ created: 0, unchanged: 1, errors: [] });
    expect(store.rows).toHaveLength(1);
  });

  it('без индекса source_2gis_url конфликт slug не теряется молча — ошибка в статистике', async () => {
    const store = new MemoryStore();
    store.failInsert = [{ message: 'no unique constraint', code: '42P10' }];
    // Строка без 2GIS URL идёт сразу с ON CONFLICT (slug); slug занимает параллельный импорт.
    store.beforeInsert = () => store.rows.push({ id: 'other', name: 'Шина Плюс', slug: 'shina-plyus', slug_history: [], source_2gis_url: null, phones: [], emails: [], websites: [], socials: null, address: null, status: 'new', rating: null, reviews_count: null, vertical_template_id: null, city: null, category: null });
    const stats = await importRows(store, [row()]);
    expect(stats.created).toBe(0);
    expect(stats.errors[0]).toMatch(/slug занят параллельно/);
  });
});

describe('chunkForFilter', () => {
  it('режет по числу элементов и по длине query string', () => {
    expect(chunkForFilter(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']]);
    const urls = Array.from({ length: 100 }, (_, i) => `https://2gis.ru/ekaterinburg/firm/${String(i).padStart(17, '0')}`);
    const parts = chunkForFilter(urls);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flat()).toEqual(urls);
    for (const p of parts) expect(p.map((u) => encodeURIComponent(u).length + 1).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(MAX_FILTER_CHARS);
  });

  it('одиночный слишком длинный элемент — отдельной пачкой, без потерь', () => {
    expect(chunkForFilter(['x'.repeat(50), 'y'], 100, 10)).toEqual([['x'.repeat(50)], ['y']]);
    expect(chunkForFilter([])).toEqual([]);
  });
});
