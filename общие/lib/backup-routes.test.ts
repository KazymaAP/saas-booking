// lib/backup-routes.test.ts — тесты route handler бэкапа: GET /api/cron/backup (CRON_SECRET), POST /api/backup/restore
// (isSuperAdmin, лимит тела, валидация). Боевые зависимости (lib/backup-deps) подменяются памятью.
import { describe, expect, it, vi } from 'vitest';
import { runBackup } from './backup';
import { MemoryDb } from '../../служебное/tests/memory-backup-db';

vi.mock('./supabase', () => ({ adminClient: () => { throw new Error('Supabase в unit-тестах не используется'); } }));

// Для теста route: зависимости performBackup подменяются, CRON_SECRET задаётся в тесте.
const cronEnv = vi.hoisted(() => ({ db: null as BackupDbLike | null, notes: [] as string[], admin: true, locked: false }));
type BackupDbLike = import('./backup').BackupDb;
vi.mock('./backup-deps', () => ({
  backupJobDeps: () => ({
    db: cronEnv.db,
    purge_pings: async () => 0,
    notify: async (t: string) => { cronEnv.notes.push(t); },
    log_error: async () => undefined,
    audit: async () => undefined,
  }),
  restoreRequestDeps: () => ({
    db: cronEnv.db,
    lock: {
      acquire: async () => { if (cronEnv.locked) return false; cronEnv.locked = true; return true; },
      release: async () => { cronEnv.locked = false; },
    },
    notify: async (t: string) => { cronEnv.notes.push(t); },
    log_error: async () => undefined,
    audit: async () => undefined,
  }),
}));
vi.mock('./admin-session', () => ({ isSuperAdmin: async () => cronEnv.admin }));

const NOW = new Date('2026-10-15T03:00:00.000Z');

describe('GET /api/cron/backup', () => {
  async function call(auth: string | null) {
    const { GET } = await import('../../app/api/cron/backup/route');
    const headers: Record<string, string> = auth ? { authorization: auth } : {};
    return GET(new Request('https://svc.example/api/cron/backup', { headers }));
  }

  it('без CRON_SECRET или с неверным токеном → 401, бэкап не делается', async () => {
    process.env.CRON_SECRET = 'cron-test';
    const db = new MemoryDb({ businesses: 1 });
    cronEnv.db = db;
    expect((await call(null)).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    expect(db.files.size).toBe(0);
  });

  it('верный токен → 200 и файл в bucket; сбой → 500 и Telegram', async () => {
    process.env.CRON_SECRET = 'cron-test';
    const db = new MemoryDb({ businesses: 2 });
    cronEnv.db = db;
    const ok = await call('Bearer cron-test');
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body).toMatchObject({ ok: true, trigger: 'cron' });
    expect(body).not.toHaveProperty('tables');
    expect(db.files.size).toBe(1);

    const broken = new MemoryDb();
    broken.fail_select.add('businesses');
    cronEnv.db = broken;
    cronEnv.notes = [];
    expect((await call('Bearer cron-test')).status).toBe(500);
    expect(cronEnv.notes).toHaveLength(1);
  });
});

describe('POST /api/backup/restore', () => {
  async function post(body: string) {
    const { POST } = await import('../../app/api/backup/restore/route');
    return POST(new Request('https://svc.example/api/backup/restore', { method: 'POST', body, headers: { 'content-type': 'application/json' } }));
  }

  it('не супер-админ → 401, данные не трогаются', async () => {
    const db = new MemoryDb({ businesses: 1 });
    await runBackup(db, NOW);
    cronEnv.db = db;
    cronEnv.admin = false;
    const res = await post(JSON.stringify({ file: 'backup-2026-10-15.json', confirm: 'ВОССТАНОВИТЬ' }));
    expect(res.status).toBe(401);
    expect(db.upsert_calls).toHaveLength(0);
  });

  it('супер-админ: мусор → 400, большое тело → 413, верный запрос → 200', async () => {
    const db = new MemoryDb({ businesses: 1 });
    await runBackup(db, NOW);
    cronEnv.db = db;
    cronEnv.admin = true;
    cronEnv.locked = false;
    expect((await post('{')).status).toBe(400);
    expect((await post(JSON.stringify({ file: 1 }))).status).toBe(400);
    expect((await post('x'.repeat(5_000))).status).toBe(413);
    const ok = await post(JSON.stringify({ file: 'backup-2026-10-15.json', confirm: 'ВОССТАНОВИТЬ' }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).ok).toBe(true);
  });
});
