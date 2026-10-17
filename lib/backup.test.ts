// lib/backup.test.ts — тесты бэкапа: полнота (пагинация), порядок restore, идемпотентность, retention, разбор дампа.
// БД и Storage подменяются памятью (tests/memory-backup-db.ts), Supabase не нужен.
// Тесты route handler (cron/backup, backup/restore) — в lib/backup-routes.test.ts.
import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ adminClient: () => { throw new Error('Supabase в unit-тестах не используется'); } }));

import {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  PAGE_SIZE,
  RESTORE_BATCH,
  SIGNED_URL_TTL_S,
  backupFileName,
  collectBackup,
  formatReport,
  handleRestoreRequest,
  isBackupFileName,
  isRestoreConfirmed,
  listBackups,
  parseDump,
  performBackup,
  pruneBackups,
  restoreDump,
  restoreFromFile,
  runBackup,
  scrubDbError,
  tablesChecksum,
} from './backup';

import { MemoryDb } from '../tests/memory-backup-db';

const NOW = new Date('2026-10-15T03:00:00.000Z');


describe('имена файлов', () => {
  it('backup-YYYY-MM-DD.json по UTC', () => {
    expect(backupFileName(NOW)).toBe('backup-2026-10-15.json');
    expect(isBackupFileName('backup-2026-10-15.json')).toBe(true);
  });

  it('обход пути и чужие файлы отклоняются', () => {
    for (const bad of ['../backup-2026-10-15.json', 'backup-2026-10-15.json.exe', 'dump.sql', 'backup-26-1-1.json', '']) {
      expect(isBackupFileName(bad)).toBe(false);
    }
  });
});

describe('collectBackup', () => {
  it('собирает все 9 таблиц', async () => {
    const dump = await collectBackup(new MemoryDb({ businesses: 3, photos: 2, vertical_templates: 1 }), NOW);
    expect(Object.keys(dump.tables).sort()).toEqual([...BACKUP_TABLES].sort());
    expect(dump.tables).toHaveProperty('photos');
    expect(dump.tables).toHaveProperty('vertical_templates');
    expect(dump.counts.businesses).toBe(3);
    expect(dump.format).toBe(BACKUP_FORMAT);
  });

  it('таблица больше 1000 строк не обрезается (пагинация)', async () => {
    const big = PAGE_SIZE * 2 + 17;
    const dump = await collectBackup(new MemoryDb({ bookings: big }), NOW);
    expect(dump.counts.bookings).toBe(big);
    expect(new Set(dump.tables.bookings.map((r) => r.id)).size).toBe(big);
  });

  it('ровно PAGE_SIZE строк — делается ещё один запрос и данные не дублируются', async () => {
    const dump = await collectBackup(new MemoryDb({ services: PAGE_SIZE }), NOW);
    expect(dump.counts.services).toBe(PAGE_SIZE);
  });

  it('ошибка чтения таблицы — весь бэкап падает, а не пишется неполным', async () => {
    const db = new MemoryDb({ businesses: 1 });
    db.fail_select.add('photos');
    await expect(collectBackup(db, NOW)).rejects.toThrow('photos');
  });
});

describe('runBackup', () => {
  it('пишет файл в bucket и возвращает размер и счётчики', async () => {
    const db = new MemoryDb({ businesses: 2 });
    const r = await runBackup(db, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file).toBe('backup-2026-10-15.json');
    expect(r.bytes).toBeGreaterThan(0);
    expect(r.counts.businesses).toBe(2);
    expect(db.files.has('backup-2026-10-15.json')).toBe(true);
  });

  it('повторный запуск в тот же день перезаписывает тот же файл (идемпотентно)', async () => {
    const db = new MemoryDb({ businesses: 1 });
    await runBackup(db, NOW);
    await runBackup(db, NOW);
    expect([...db.files.keys()]).toEqual(['backup-2026-10-15.json']);
  });

  it('сбой чтения или загрузки → ok:false с причиной', async () => {
    const a = new MemoryDb();
    a.fail_select.add('licenses');
    expect(await runBackup(a, NOW)).toEqual({ ok: false, error: 'licenses: select failed' });
    const b = new MemoryDb();
    b.fail_upload = true;
    expect(await runBackup(b, NOW)).toEqual({ ok: false, error: 'upload: storage down' });
  });
});

describe('pruneBackups (retention 30 дней)', () => {
  it('удаляет копии старше 30 дней, не трогает свежие и чужие файлы', async () => {
    const db = new MemoryDb();
    for (const n of ['backup-2026-09-01.json', 'backup-2026-09-14.json', 'backup-2026-09-16.json', 'backup-2026-10-15.json', 'manual.sql']) db.files.set(n, '{}');
    const removed = await pruneBackups(db, NOW);
    expect(removed.sort()).toEqual(['backup-2026-09-01.json', 'backup-2026-09-14.json']);
    expect(db.files.has('manual.sql')).toBe(true);
    expect(db.files.has('backup-2026-09-16.json')).toBe(true);
  });

  it('последняя копия не удаляется, даже если она старая', async () => {
    const db = new MemoryDb();
    db.files.set('backup-2026-01-01.json', '{}');
    expect(await pruneBackups(db, NOW)).toEqual([]);
    expect(db.files.size).toBe(1);
  });
});

describe('parseDump', () => {
  it('новый формат', async () => {
    const dump = await collectBackup(new MemoryDb({ businesses: 1 }), NOW);
    const r = parseDump(JSON.stringify(dump));
    expect(r.ok && r.dump.counts.businesses).toBe(1);
  });

  it('старый формат cron/[job] (таблицы на верхнем уровне, null вместо массива)', () => {
    const r = parseDump(JSON.stringify({ businesses: [{ id: 'b1' }], services: null }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dump.counts.businesses).toBe(1);
    expect(r.dump.counts.services).toBe(0);
    expect(r.dump.counts.photos).toBe(0);
  });

  it('мусор, не-массив, строки без id и будущая версия отклоняются', () => {
    expect(parseDump('not json')).toEqual({ ok: false, error: 'файл не является JSON' });
    expect(parseDump('[1,2]').ok).toBe(false);
    expect(parseDump(JSON.stringify({ businesses: { id: 'x' } }))).toEqual({ ok: false, error: 'businesses: ожидался массив' });
    expect(parseDump(JSON.stringify({ businesses: [{ id: 'a' }, { name: 'no id' }] }))).toEqual({ ok: false, error: 'businesses: строка 2 без id' });
    expect(parseDump(JSON.stringify({ format: BACKUP_FORMAT, version: 99, tables: {} })).ok).toBe(false);
  });
});

describe('parseDump: целостность', () => {
  it('дубли id в таблице отклоняются', () => {
    expect(parseDump(JSON.stringify({ businesses: [{ id: 'a' }, { id: 'a' }] }))).toEqual({ ok: false, error: 'businesses: повторяется id в строке 2' });
  });

  it('пустой id отклоняется', () => {
    expect(parseDump(JSON.stringify({ businesses: [{ id: '' }] })).ok).toBe(false);
  });

  it('счётчик counts не совпадает с данными → файл обрезан/изменён, restore запрещён', async () => {
    const dump = await collectBackup(new MemoryDb({ services: 3 }), NOW);
    dump.tables.services.pop();
    const r = parseDump(JSON.stringify(dump));
    expect(r).toEqual({ ok: false, error: 'services: в файле 3 строк по счётчику, найдено 2' });
  });
});

describe('restoreDump', () => {
  it('порядок записи: родители → дети', async () => {
    const src = new MemoryDb(Object.fromEntries(BACKUP_TABLES.map((t) => [t, 1])));
    const dump = await collectBackup(src, NOW);
    const dst = new MemoryDb();
    const report = await restoreDump(dst, dump);
    expect(report.ok).toBe(true);
    expect(dst.upsert_calls.map((c) => c.table)).toEqual([...BACKUP_TABLES]);
    expect(report.total_rows).toBe(BACKUP_TABLES.length);
  });

  it('batch не больше 500 строк', async () => {
    const dump = await collectBackup(new MemoryDb({ bookings: RESTORE_BATCH * 2 + 1 }), NOW);
    const dst = new MemoryDb();
    await restoreDump(dst, dump);
    expect(dst.upsert_calls.filter((c) => c.table === 'bookings').map((c) => c.size)).toEqual([500, 500, 1]);
  });

  it('повторный restore того же дампа не дублирует строки (upsert по id)', async () => {
    const dump = await collectBackup(new MemoryDb({ businesses: 5, services: 3 }), NOW);
    const dst = new MemoryDb();
    await restoreDump(dst, dump);
    await restoreDump(dst, dump);
    expect(dst.rows('businesses')).toHaveLength(5);
    expect(dst.rows('services')).toHaveLength(3);
  });

  it('upsert перезаписывает изменённые после бэкапа строки значениями из копии', async () => {
    const dump = await collectBackup(new MemoryDb({ businesses: 1 }), NOW);
    const dst = new MemoryDb({ businesses: 1 });
    const id = dst.rows('businesses')[0].id;
    dst.tables.get('businesses')?.set(id, { id, n: 999 });
    await restoreDump(dst, dump);
    expect(dst.rows('businesses')[0]).toEqual({ id, n: 0 });
  });

  it('ошибка родителя → дети пропускаются, независимые таблицы пишутся, отчёт по таблицам', async () => {
    const dump = await collectBackup(new MemoryDb(Object.fromEntries(BACKUP_TABLES.map((t) => [t, 2]))), NOW);
    const dst = new MemoryDb();
    dst.fail_upsert.add('services');
    const r = await restoreDump(dst, dump);
    expect(r.ok).toBe(false);
    expect(r.tables.services.status).toBe('error');
    expect(r.tables.bookings.status).toBe('skipped');
    expect(r.tables.photos.status).toBe('ok');
    expect(r.tables.licenses.status).toBe('ok');
    expect(dst.upsert_calls.some((c) => c.table === 'bookings')).toBe(false);
    expect(formatReport(r)).toContain('bookings: 0 (пропущено)');
    expect(formatReport(r)).toContain('services: 0 (ошибка)');
  });

  it('ошибка businesses останавливает всё зависимое', async () => {
    const dump = await collectBackup(new MemoryDb(Object.fromEntries(BACKUP_TABLES.map((t) => [t, 1]))), NOW);
    const dst = new MemoryDb();
    dst.fail_upsert.add('businesses');
    const r = await restoreDump(dst, dump);
    expect(r.tables.vertical_templates.status).toBe('ok');
    for (const t of BACKUP_TABLES.filter((x) => x !== 'vertical_templates' && x !== 'businesses')) {
      expect(r.tables[t].status).toBe('skipped');
    }
  });
});

describe('устойчивость к исключениям', () => {
  it('исключение upsert (сеть) → ошибка таблицы в отчёте, а не падение restore', async () => {
    const dump = await collectBackup(new MemoryDb({ businesses: 1, photos: 1, licenses: 1 }), NOW);
    const dst = new MemoryDb();
    dst.throw_upsert.add('photos');
    const r = await restoreDump(dst, dump);
    expect(r.tables.photos).toEqual({ rows: 0, status: 'error', error: 'fetch failed' });
    expect(r.tables.licenses.status).toBe('ok');
  });

  it('исключение list при retention не роняет успешный бэкап', async () => {
    const db = new MemoryDb({ businesses: 1 });
    db.list = async () => { throw new TypeError('fetch failed'); };
    const r = await runBackup(db, NOW);
    expect(r.ok).toBe(true);
  });
});

describe('restoreFromFile', () => {
  it('сквозной цикл: бэкап → потеря данных → восстановление', async () => {
    const db = new MemoryDb({ businesses: 4, bookings: 7, photos: 2 });
    await runBackup(db, NOW);
    db.tables.get('bookings')?.clear();
    const r = await restoreFromFile(db, 'backup-2026-10-15.json');
    expect(r.ok).toBe(true);
    expect(db.rows('bookings')).toHaveLength(7);
  });

  it('неверное имя, нет файла, битый файл', async () => {
    const db = new MemoryDb();
    db.files.set('backup-2026-10-14.json', '{broken');
    expect(await restoreFromFile(db, '../etc/passwd')).toMatchObject({ ok: false, reason: 'file_name' });
    expect(await restoreFromFile(db, 'backup-2020-01-01.json')).toMatchObject({ ok: false, reason: 'not_found' });
    expect(await restoreFromFile(db, 'backup-2026-10-14.json')).toMatchObject({ ok: false, reason: 'parse' });
    expect(db.upsert_calls).toHaveLength(0);
  });
});

describe('listBackups', () => {
  it('только наши файлы, новые сверху, signed URL с TTL 300 с', async () => {
    const db = new MemoryDb();
    for (const n of ['backup-2026-10-13.json', 'backup-2026-10-15.json', 'notes.txt', 'backup-2026-10-14.json']) db.files.set(n, '{}');
    const { items } = await listBackups(db);
    expect(items.map((i) => i.name)).toEqual(['backup-2026-10-15.json', 'backup-2026-10-14.json', 'backup-2026-10-13.json']);
    expect(db.signed.every((s) => s.ttl === SIGNED_URL_TTL_S)).toBe(true);
    expect(SIGNED_URL_TTL_S).toBe(300);
    expect(items[0].url).toContain('backup-2026-10-15.json');
  });
});

describe('isRestoreConfirmed', () => {
  it('только точное слово ВОССТАНОВИТЬ', () => {
    expect(isRestoreConfirmed('ВОССТАНОВИТЬ')).toBe(true);
    expect(isRestoreConfirmed(' ВОССТАНОВИТЬ ')).toBe(true);
    for (const bad of ['восстановить', 'ВОССТАНОВИ', '', null, undefined, 1]) expect(isRestoreConfirmed(bad)).toBe(false);
  });
});

describe('performBackup', () => {
  function deps(db: MemoryDb, opts: { purge_fail?: boolean } = {}) {
    const log: string[] = [];
    const tg: string[] = [];
    const au: { action: string; payload: Record<string, unknown> }[] = [];
    return {
      log, tg, au,
      deps: {
        db,
        purge_pings: async () => { if (opts.purge_fail) throw new Error('pings down'); return 12; },
        notify: async (t: string) => { tg.push(t); },
        log_error: async (m: string) => { log.push(m); },
        audit: async (action: string, payload: Record<string, unknown>) => { au.push({ action, payload }); },
      },
    };
  }

  it('успех: файл, retention ping, audit без Telegram', async () => {
    const d = deps(new MemoryDb({ businesses: 1 }));
    const r = await performBackup(d.deps, 'cron', NOW);
    expect(r.ok).toBe(true);
    expect(r.pings_purged).toBe(12);
    expect(d.tg).toHaveLength(0);
    expect(d.au[0].action).toBe('backup_created');
    expect(d.au[0].payload).not.toHaveProperty('tables');
  });

  it('сбой бэкапа → журнал + Telegram, audit не пишется', async () => {
    const db = new MemoryDb();
    db.fail_upload = true;
    const d = deps(db);
    const r = await performBackup(d.deps, 'manual', NOW);
    expect(r.ok).toBe(false);
    expect(d.log[0]).toContain('upload');
    expect(d.tg[0]).toContain('manual');
    expect(d.au).toHaveLength(0);
  });

  it('сбой очистки license_pings не отменяет бэкап', async () => {
    const d = deps(new MemoryDb(), { purge_fail: true });
    const r = await performBackup(d.deps, 'cron', NOW);
    expect(r.ok).toBe(true);
    expect(r.pings_purged).toBeNull();
    expect(d.log[0]).toContain('license_pings');
  });
});

describe('handleRestoreRequest', () => {
  function deps(db: MemoryDb) {
    const state = { held: false, released: 0, audits: [] as string[], tg: [] as string[] };
    return {
      state,
      deps: {
        db,
        lock: {
          acquire: async () => { if (state.held) return false; state.held = true; return true; },
          release: async () => { state.held = false; state.released += 1; },
        },
        log_error: async () => undefined,
        audit: async (a: string) => { state.audits.push(a); },
        notify: async (t: string) => { state.tg.push(t); },
      },
    };
  }

  async function seeded(): Promise<MemoryDb> {
    const db = new MemoryDb({ businesses: 2, services: 2 });
    await runBackup(db, NOW);
    return db;
  }

  it('без точного ВОССТАНОВИТЬ ничего не пишется и блокировка не берётся', async () => {
    const db = await seeded();
    const d = deps(db);
    const r = await handleRestoreRequest({ file: 'backup-2026-10-15.json', confirm: 'восстановить' }, d.deps);
    expect(r).toEqual({ http_status: 400, body: { ok: false, reason: 'confirm' } });
    expect(db.upsert_calls).toHaveLength(0);
    expect(d.state.released).toBe(0);
  });

  it('успех → 200, отчёт, audit, блокировка снята', async () => {
    const d = deps(await seeded());
    const r = await handleRestoreRequest({ file: 'backup-2026-10-15.json', confirm: 'ВОССТАНОВИТЬ' }, d.deps);
    expect(r.http_status).toBe(200);
    expect(r.body.report?.tables.businesses).toEqual({ rows: 2, status: 'ok' });
    expect(d.state.audits).toEqual(['backup_restore']);
    expect(d.state.held).toBe(false);
  });

  it('параллельный запуск → 409', async () => {
    const d = deps(await seeded());
    d.state.held = true;
    const r = await handleRestoreRequest({ file: 'backup-2026-10-15.json', confirm: 'ВОССТАНОВИТЬ' }, d.deps);
    expect(r).toEqual({ http_status: 409, body: { ok: false, reason: 'in_progress' } });
  });

  it('частичный сбой → 207, Telegram, блокировка снята; нет файла → 404', async () => {
    const db = await seeded();
    db.fail_upsert.add('services');
    const d = deps(db);
    const r = await handleRestoreRequest({ file: 'backup-2026-10-15.json', confirm: 'ВОССТАНОВИТЬ' }, d.deps);
    expect(r.http_status).toBe(207);
    expect(r.body.summary).toContain('services: 0 (ошибка)');
    expect(d.state.tg).toHaveLength(1);
    expect(d.state.held).toBe(false);
    const nf = await handleRestoreRequest({ file: 'backup-2001-01-01.json', confirm: 'ВОССТАНОВИТЬ' }, d.deps);
    expect(nf.http_status).toBe(404);
    expect(d.state.held).toBe(false);
  });
});

describe('раунд 2: целостность и безопасность restore', () => {
  async function stored(): Promise<{ db: MemoryDb; text: string }> {
    const db = new MemoryDb({ businesses: 2, services: 3 });
    await runBackup(db, NOW);
    return { db, text: db.files.get('backup-2026-10-15.json') ?? '' };
  }

  it('копия содержит SHA-256 таблиц, разбор её сохраняет', async () => {
    const { text } = await stored();
    const parsed = parseDump(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.dump.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(await tablesChecksum(parsed.dump.tables)).toBe(parsed.dump.checksum);
  });

  it('правка значения в файле (число строк то же) → restore отклонён до первой записи', async () => {
    const { db, text } = await stored();
    db.files.set('backup-2026-10-15.json', text.replace('"n":1', '"n":999'));
    const r = await restoreFromFile(db, 'backup-2026-10-15.json');
    expect(r).toMatchObject({ ok: false, reason: 'parse' });
    expect(db.upsert_calls).toHaveLength(0);
  });

  it('мусор в поле checksum → ошибка разбора; копия без checksum (старый формат) принимается', async () => {
    const { text } = await stored();
    const obj = JSON.parse(text);
    expect(parseDump(JSON.stringify({ ...obj, checksum: 'abc' })).ok).toBe(false);
    const { checksum: _drop, ...legacy } = obj;
    expect(parseDump(JSON.stringify(legacy)).ok).toBe(true);
  });

  it('ошибка Postgres в отчёте без значений строк (PII)', async () => {
    const msg = 'duplicate key value violates unique constraint "x" Key (email)=(ivan@mail.ru) phone +7 (999) 123-45-67';
    const clean = scrubDbError(msg);
    expect(clean).toContain('Key (email)=(…)');
    expect(clean).not.toContain('ivan@mail.ru');
    expect(clean).not.toContain('123-45-67');
  });

  it('хранилище блокировки недоступно → 503, restore не запускается', async () => {
    const { db } = await stored();
    const r = await handleRestoreRequest({ file: 'backup-2026-10-15.json', confirm: 'ВОССТАНОВИТЬ' }, {
      db,
      lock: { acquire: async () => { throw new Error('db down'); }, release: async () => undefined },
      log_error: async () => undefined,
      audit: async () => undefined,
      notify: async () => undefined,
    });
    expect(r).toEqual({ http_status: 503, body: { ok: false, reason: 'lock' } });
    expect(db.upsert_calls).toHaveLength(0);
  });
});
