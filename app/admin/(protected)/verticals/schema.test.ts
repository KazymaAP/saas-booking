// Тесты валидации ниш: структура JSON-полей, системные префиксы, отчёт импорта.
import { describe, expect, it } from 'vitest';
import { issuePath, parseJsonSafe, validateImport, verticalSchema } from './schema';

const base = { name: 'Шиномонтаж', slug: 'tire-service', url_prefix: 't' };

describe('verticalSchema', () => {
  it('принимает минимальную нишу и подставляет значения по умолчанию', () => {
    const r = verticalSchema.safeParse(base);
    expect(r.success && r.data).toMatchObject({ default_services: [], default_texts: {}, is_active: true, icon: null });
  });
  it('отклоняет системный префикс', () => {
    expect(verticalSchema.safeParse({ ...base, url_prefix: 'api' }).success).toBe(false);
  });
  it('проверяет структуру услуг: отрицательная цена → путь до поля', () => {
    const r = verticalSchema.safeParse({ ...base, default_services: [{ name: 'A', price: 100, duration: 30 }, { name: 'B', price: -1, duration: 30 }] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0] && issuePath(r.error.issues[0])).toBe('default_services[1].price');
  });
  it('запрещает лишние ключи в цветах и неверный hex', () => {
    expect(verticalSchema.safeParse({ ...base, default_colors: { primary: 'red' } }).success).toBe(false);
    expect(verticalSchema.safeParse({ ...base, default_colors: { primary: '#111111', hack: '#000000' } }).success).toBe(false);
  });
  it('выбрасывает поля, которых нет в схеме (id, created_at)', () => {
    const r = verticalSchema.safeParse({ ...base, id: 'x', created_at: '2020' });
    expect(r.success && 'id' in r.data).toBe(false);
  });
});

describe('parseJsonSafe', () => {
  it('пустая строка → значение по умолчанию', () => {
    expect(parseJsonSafe('  ', '[]')).toEqual({ ok: true, value: [] });
  });
  it('синтаксическая ошибка → текст для поля', () => {
    const r = parseJsonSafe('{"a":', '{}');
    expect(r.ok).toBe(false);
  });
});

describe('validateImport', () => {
  it('не массив — одна понятная ошибка', () => {
    expect(validateImport({ a: 1 }).errors).toHaveLength(1);
  });
  it('разделяет валидные и невалидные, номер записи в отчёте', () => {
    const r = validateImport([base, { name: 'X' }, { ...base, slug: 'barber', url_prefix: 'b' }]);
    expect(r.valid.map((v) => v.slug)).toEqual(['tire-service', 'barber']);
    expect(r.errors[0]).toMatch(/^№2:/);
  });
  it('повтор slug или префикса в одном файле отклоняется', () => {
    const r = validateImport([base, { ...base, slug: 'other' }]);
    expect(r.valid).toHaveLength(1);
    expect(r.errors[0]).toContain('повтор');
  });
});
