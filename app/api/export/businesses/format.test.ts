// Тесты форматирования экспорта: экранирование CSV, защита от формул, массивы, имя файла.
import { describe, expect, it } from 'vitest';
import { COLUMNS, csvCell, csvLine, fileBase, safeText, xlsxRecord } from './format';

describe('csvCell', () => {
  it('кавычки, запятые, точки с запятой и переводы строк экранируются', () => {
    expect(csvCell('Салон "Шик", центр')).toBe('"Салон ""Шик"", центр"');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell(null)).toBe('');
  });
  it('массивы — через «; » (в кавычках из-за ;)', () => {
    expect(csvCell(['+79991234567', '+79990000000'])).toBe('"+79991234567; +79990000000"');
  });
});

describe('safeText — формульная инъекция', () => {
  it('формулы получают апостроф', () => {
    expect(safeText('=HYPERLINK("http://x")')).toBe(`'=HYPERLINK("http://x")`);
    expect(safeText('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(safeText('+cmd|calc')).toBe("'+cmd|calc");
  });
  it('телефоны и отрицательные числа не трогаются', () => {
    expect(safeText('+7 (999) 123-45-67')).toBe('+7 (999) 123-45-67');
    expect(safeText('-5')).toBe('-5');
    expect(safeText('Барбершоп')).toBe('Барбершоп');
  });
});

describe('строки', () => {
  it('csvLine — все колонки по порядку', () => {
    const line = csvLine({ id: '1', name: 'A', rating: 4.5 });
    expect(line.split(',')).toHaveLength(COLUMNS.length);
    expect(line.startsWith('1,A,')).toBe(true);
  });
  it('xlsxRecord — числа остаются числами, формулы обезврежены', () => {
    const r = xlsxRecord({ rating: 4.5, name: '=1+1', emails: ['a@b.ru'] });
    expect(r.rating).toBe(4.5);
    expect(r.name).toBe("'=1+1");
    expect(r.emails).toBe('a@b.ru');
  });
  it('fileBase — только безопасные символы', () => {
    const d = new Date('2026-10-15T10:00:00Z');
    expect(fileBase('preview_ready', d)).toBe('businesses-preview_ready-2026-10-15');
    expect(fileBase('', d)).toBe('businesses-2026-10-15');
  });
});
