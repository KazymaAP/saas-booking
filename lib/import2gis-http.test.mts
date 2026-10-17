// lib/import2gis-http.test.ts — обработчик /api/import/2gis (Vitest): доступ, размер, тип, dry-run, ошибки файла.
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { handleImport, type ImportDeps } from './import2gis-http';
import type { ImportStats } from './import2gis';
import { OFFLINE_STORE, type ImportStore } from './import2gis-store';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function xlsx(rows: Record<string, string>[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

const ROW = { Наименование: 'Шина Плюс', Рубрики: 'Шиномонтаж', Адрес: 'ул. Ленина 1', Телефон: '89089240660', 'E-mail': 'a@b.ru', '2GIS URL': 'https://2gis.ru/firm/1' };

function request(file: Uint8Array | null, fields: Record<string, string> = {}, name = 'export.xlsx', type = XLSX_MIME): Request {
  const form = new FormData();
  if (file) form.set('file', new File([file], name, { type }));
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request('http://local/api/import/2gis', { method: 'POST', body: form });
}

// Хранилище, которое падает при любом обращении: в dry-run и при отказах до БД доходить нельзя.
const untouchable: ImportStore = OFFLINE_STORE;

function deps(over: Partial<ImportDeps> = {}): ImportDeps & { audited: ImportStats[]; logged: string[] } {
  const audited: ImportStats[] = [];
  const logged: string[] = [];
  return {
    isSuperAdmin: async () => true,
    db: () => untouchable,
    audit: async (s) => { audited.push(s); },
    logError: async (m) => { logged.push(m); },
    audited, logged, ...over,
  };
}

describe('handleImport', () => {
  it('не супер-админ — 401, тело не читается', async () => {
    const res = await handleImport(request(xlsx([ROW])), deps({ isSuperAdmin: async () => false }));
    expect(res).toEqual({ status: 401, body: { ok: false, reason: 'auth' } });
  });

  it('dry-run: статистика без записи и без audit', async () => {
    const d = deps();
    const res = await handleImport(request(xlsx([ROW, { ...ROW, Рубрики: 'Цветы', '2GIS URL': 'https://2gis.ru/firm/2' }]), { dry_run: '1' }), d);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, stats: { total: 2, selected: 1, withEmail: 1, created: 0, dryRun: true } });
    expect(d.audited).toHaveLength(0);
  });

  it('пустой фильтр → «шин» по умолчанию; слишком длинный — 400', async () => {
    const ok = await handleImport(request(xlsx([ROW]), { dry_run: '1', filter: '  ' }), deps());
    expect(ok.body).toMatchObject({ ok: true, stats: { selected: 1 } });
    const bad = await handleImport(request(xlsx([ROW]), { dry_run: '1', filter: 'x'.repeat(101) }), deps());
    expect(bad).toMatchObject({ status: 400, body: { reason: 'filter' } });
  });

  it('нет файла / пустой файл — 400', async () => {
    expect((await handleImport(request(null), deps())).body).toMatchObject({ reason: 'file' });
    expect((await handleImport(request(new Uint8Array()), deps())).body).toMatchObject({ reason: 'file' });
  });

  it('больше 10 МБ — 413 (по Content-Length до чтения тела)', async () => {
    const req = new Request('http://local/api/import/2gis', { method: 'POST', headers: { 'content-length': String(11 * 1024 * 1024) }, body: 'x' });
    expect(await handleImport(req, deps())).toMatchObject({ status: 413, body: { reason: 'too_large' } });
  });

  it('не xlsx: расширение, MIME или сигнатура — 415', async () => {
    expect((await handleImport(request(xlsx([ROW]), {}, 'export.csv'), deps())).status).toBe(415);
    expect((await handleImport(request(xlsx([ROW]), {}, 'export.xlsx', 'text/html'), deps())).status).toBe(415);
    expect((await handleImport(request(new TextEncoder().encode('<html>'), {}, 'export.xlsx'), deps())).status).toBe(415);
  });

  it('нет обязательных колонок — 422 с причиной', async () => {
    const res = await handleImport(request(xlsx([{ Колонка: 'x' }]), { dry_run: '1' }), deps());
    expect(res).toMatchObject({ status: 422, body: { ok: false, reason: 'headers' } });
  });

  it('ошибка БД — 500, в журнал', async () => {
    const d = deps();
    const res = await handleImport(request(xlsx([ROW])), d);
    expect(res).toMatchObject({ status: 500, body: { reason: 'server' } });
    expect(d.logged).toHaveLength(1);
  });
});
