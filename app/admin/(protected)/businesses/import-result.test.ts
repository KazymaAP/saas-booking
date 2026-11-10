// Тесты разбора ответа импорта 2GIS: права, причины ошибок, сводка, защита от кривого ответа.
import { describe, expect, it } from 'vitest';
import { interpret } from './import-result';

const stats = { total: 10, selected: 6, withEmail: 4, created: 3, updated: 2, errors: [{ row: 5 }] };

describe('interpret', () => {
  it.each([401, 403])('HTTP %i — «нет доступа»', (status) => {
    expect(interpret({ status, body: { ok: true, stats } }, false)).toEqual({ ok: false, text: 'Ошибка: нет доступа' });
  });
  it('известная причина — человеческий текст', () => {
    expect(interpret({ status: 400, body: { ok: false, reason: 'parse' } }, false).text).toBe('Ошибка: не удалось прочитать файл');
  });
  it('неизвестная причина и имя из прототипа — общий текст', () => {
    expect(interpret({ status: 400, body: { ok: false, reason: 'zzz' } }, false).text).toBe('Ошибка: сервер не ответил');
    expect(interpret({ status: 400, body: { ok: false, reason: 'toString' } }, false).text).toBe('Ошибка: сервер не ответил');
  });
  it('сеть упала (status 0, body null) — общий текст', () => {
    expect(interpret({ status: 0, body: null }, false)).toEqual({ ok: false, text: 'Ошибка: сервер не ответил' });
  });
  it('errors не массив — ответ считается битым', () => {
    expect(interpret({ status: 200, body: { ok: true, stats: { ...stats, errors: 'x' } } }, false).ok).toBe(false);
  });
  it('успех — сводка; dry run помечен', () => {
    const real = interpret({ status: 200, body: { ok: true, stats } }, false);
    expect(real).toEqual({ ok: true, text: 'Импорт завершён: строк 10, по фильтру 6, с email 4, создано 3, обновлено 2, ошибок 1.' });
    expect(interpret({ status: 200, body: { ok: true, stats } }, true).text.startsWith('Проверка без записи')).toBe(true);
  });
});
