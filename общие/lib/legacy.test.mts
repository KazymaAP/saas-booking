// lib/legacy.test.ts — миграция legacy CSV (Vitest): разбор RFC 4180, Zod, upsert по slug, редиректы, retry.
import { describe, expect, it } from 'vitest';
import { applyLegacy, isActive, type LegacyExisting, type LegacyRow, type LegacyStore } from './legacy-apply';
import { CsvError, normalizeDomain, parseCsv, parseDate, parseLegacyCsv } from './legacy-csv';

const HEAD = 'slug,name,city,phone,email,subscription_until,old_domain,new_url';

describe('parseCsv', () => {
  it('кавычки, запятые и переводы строк внутри поля, "" → "', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi""\nnext"\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"\nnext']]);
  });

  it('разделитель «;» (Excel RU), BOM, пустые строки', () => {
    expect(parseCsv('\uFEFFa;b\n\n1;2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('незакрытая кавычка — ошибка', () => {
    expect(() => parseCsv('a\n"oops')).toThrow(CsvError);
  });
});

describe('нормализация', () => {
  it('даты ISO и ДД.ММ.ГГГГ, несуществующие — null', () => {
    expect(parseDate('2025-12-31')).toBe('2025-12-31');
    expect(parseDate('31.12.2025')).toBe('2025-12-31');
    expect(parseDate('31.02.2025')).toBeNull();
    expect(parseDate('завтра')).toBeNull();
  });

  it('домен: схема, www, путь отбрасываются', () => {
    expect(normalizeDomain('https://www.Shina-Plus.ru/old/')).toBe('shina-plus.ru');
    expect(normalizeDomain('localhost')).toBeNull();
    expect(normalizeDomain('a b.ru')).toBeNull();
  });

  it('подписка активна до даты включительно', () => {
    expect(isActive('2025-10-15', '2025-10-15')).toBe(true);
    expect(isActive('2025-10-14', '2025-10-15')).toBe(false);
    expect(isActive(null, '2025-10-15')).toBe(false);
  });
});

describe('parseLegacyCsv (Zod)', () => {
  it('валидная строка: телефон, email в нижнем регистре, редирект', () => {
    const { records, errors } = parseLegacyCsv(`${HEAD}\nshina,"Шина, Плюс",Екб,8 (908) 924-06-60,Info@Shina.RU,31.12.2025,www.old.ru,https://zapishisya.ru/t/shina`);
    expect(errors).toEqual([]);
    expect(records[0]).toMatchObject({ slug: 'shina', name: 'Шина, Плюс', phones: ['+79089240660'], emails: ['info@shina.ru'], subscription_until: '2025-12-31', redirect: { from_domain: 'old.ru', to_url: 'https://zapishisya.ru/t/shina' } });
  });

  it('пустой slug → из названия; невалидные поля — строка пропускается с номером', () => {
    const csv = `${HEAD}\n,Шина Плюс,,,,,,\nBAD SLUG,x,,,,,,\nok,y,,123,,,,\nok2,z,,,not-email,,,\nok3,w,,,,,old.ru,javascript:alert(1)`;
    const { records, errors } = parseLegacyCsv(csv);
    expect(records.map((r) => r.slug)).toEqual(['shina-plyus']);
    expect(errors.map((e) => e.slice(0, 9))).toEqual(['Строка 3:', 'Строка 4:', 'Строка 5:', 'Строка 6:']);
    expect(errors[3]).toMatch(/new_url/);
  });

  it('повтор slug — последняя строка побеждает', () => {
    const { records, duplicates } = parseLegacyCsv(`${HEAD}\ns,Первый,,,,,,\ns,Второй,,,,,,`);
    expect(duplicates).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('Второй');
  });

  it('нет колонки name — ошибка файла', () => {
    expect(() => parseLegacyCsv('slug,city\na,b')).toThrow(/name/);
  });
});

class MemoryLegacy implements LegacyStore {
  rows: Array<LegacyRow & { id: string }> = [];
  redirects = new Map<string, string>();
  failOnce = false;
  async templates() {
    return new Map([['tire-service', 'tpl-tire'], ['sauna', 'tpl-sauna']]);
  }
  async existing(slugs: readonly string[]): Promise<LegacyExisting[]> {
    return this.rows.filter((r) => slugs.includes(r.slug));
  }
  async upsertBusinesses(batch: readonly LegacyRow[]) {
    if (this.failOnce) { this.failOnce = false; throw new Error('timeout'); }
    for (const r of batch) {
      const i = this.rows.findIndex((x) => x.slug === r.slug);
      if (i >= 0) this.rows[i] = { ...this.rows[i], ...r };
      else this.rows.push({ ...r, id: `id-${this.rows.length}` });
    }
  }
  async upsertRedirects(batch: ReadonlyArray<{ from_domain: string; to_url: string }>) {
    for (const r of batch) this.redirects.set(r.from_domain, r.to_url);
  }
}

describe('applyLegacy', () => {
  const noSleep = { sleep: async () => undefined };
  const csv = `${HEAD},vertical\nshina,Шина,,89089240660,a@b.ru,2030-01-01,old.ru,https://z.ru/t/shina,\nbanya,Баня,,,,,,,sauna`;

  it('создаёт, повторный запуск обновляет без дублей; телефоны дописываются; ниша существующего не меняется', async () => {
    const store = new MemoryLegacy();
    const first = await applyLegacy(store, parseLegacyCsv(csv).records, '2025-10-15', noSleep);
    expect(first).toMatchObject({ created: 2, updated: 0, redirects: 1, errors: [] });
    expect(store.rows.map((r) => [r.slug, r.vertical_template_id, r.subscription_active])).toEqual([['shina', 'tpl-tire', true], ['banya', 'tpl-sauna', false]]);
    store.rows[0].phones = ['+70000000000'];
    store.rows[0].vertical_template_id = 'manual';
    const second = await applyLegacy(store, parseLegacyCsv(csv).records, '2025-10-15', noSleep);
    expect(second).toMatchObject({ created: 0, updated: 2 });
    expect(store.rows).toHaveLength(2);
    expect(store.rows[0]).toMatchObject({ phones: ['+70000000000', '+79089240660'], vertical_template_id: 'manual' });
    expect(store.redirects.get('old.ru')).toBe('https://z.ru/t/shina');
  });

  it('временная ошибка — retry', async () => {
    const store = new MemoryLegacy();
    store.failOnce = true;
    expect((await applyLegacy(store, parseLegacyCsv(csv).records, '2025-10-15', noSleep)).created).toBe(2);
  });
});
