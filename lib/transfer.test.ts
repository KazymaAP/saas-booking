// lib/transfer.test.ts — тесты передачи кода (lib/transfer.ts, app/api/transfer/[id]): один .txt без ZIP,
// идемпотентность support_until, ключ лицензии в файле, сквозной сценарий transfer → ping. Вынесено из backup.test.ts.
import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ adminClient: () => { throw new Error('Supabase в unit-тестах не используется'); } }));

// Для теста route: права супер-админа и хранилище transfer подменяются.
const env = vi.hoisted(() => ({ admin: true, store: null as import('./transfer').TransferStore | null }));
vi.mock('./admin-session', () => ({ isSuperAdmin: async () => env.admin }));
vi.mock('./transfer', async (importOriginal) => {
  const real = await importOriginal<typeof import('./transfer')>();
  return { ...real, supabaseTransferStore: () => env.store };
});

import {
  MIGRATION_FILES,
  buildTransferText,
  handleTransfer,
  splitTransferText,
  transferFileName,
  type TransferBusiness,
  type TransferStore,
} from './transfer';
import { deriveLicenseKey, handlePing, type LicenseRow, type LicenseStore } from './license-server';
import { readLicenseConfig, sendPing } from './license-client';
import { readdirSync } from 'node:fs';

const NOW = new Date('2026-10-15T03:00:00.000Z');

const BIZ_ID = '22222222-2222-4222-8222-222222222222';
const LIC_ID = '33333333-3333-4333-8333-333333333333';
const MASTER = 'master-secret-for-tests-0123456789';

class MemoryTransferStore implements TransferStore {
  b: TransferBusiness;
  licenses_created = 0;
  audits: Record<string, unknown>[] = [];
  constructor(over: Partial<TransferBusiness> = {}) {
    this.b = { id: BIZ_ID, name: 'Студия «Ромашка»', slug: 'romashka', status: 'client', custom_domain: 'romashka.ru', license_id: null, code_transferred_at: null, support_until: null, ...over };
  }
  async findBusiness(id: string) { return id === this.b.id ? { ...this.b } : null; }
  async ensureLicense(b: TransferBusiness) {
    if (b.license_id) return b.license_id;
    this.licenses_created += 1;
    this.b.license_id = LIC_ID;
    return LIC_ID;
  }
  async markTransferred(_id: string, at: string, support_until: string) {
    if (!this.b.code_transferred_at) { this.b.code_transferred_at = at; this.b.support_until = support_until; }
    return { code_transferred_at: this.b.code_transferred_at, support_until: this.b.support_until ?? support_until };
  }
  async audit(_id: string, payload: Record<string, unknown>) { this.audits.push(payload); }
}

const deps = (store: TransferStore, now = NOW) => ({ store, master_secret: MASTER, server_url: 'https://svc.example', now });

describe('transfer', () => {
  it('один .txt с 4 разделами, имя transfer-{slug}.txt', async () => {
    const r = await handleTransfer(BIZ_ID, deps(new MemoryTransferStore()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file_name).toBe('transfer-romashka.txt');
    const files = splitTransferText(r.text);
    expect(Object.keys(files)).toEqual(['README.md', 'INSTALL.md', 'MIGRATIONS.md', '.env.example']);
    expect(files['.env.example']).toContain(`LICENSE_ID=${LIC_ID}`);
    expect(files['.env.example']).toContain('LICENSE_SERVER_URL=https://svc.example');
  });

  it('в файле производный ключ лицензии, мастер-секрета нет; в README ключей нет', async () => {
    const r = await handleTransfer(BIZ_ID, deps(new MemoryTransferStore()));
    if (!r.ok) throw new Error('transfer failed');
    const key = await deriveLicenseKey(MASTER, LIC_ID);
    const files = splitTransferText(r.text);
    expect(files['.env.example']).toContain(`LICENSE_HMAC_SECRET=${key}`);
    expect(r.text).not.toContain(MASTER);
    expect(files['README.md']).not.toContain(key);
  });

  it('support_until = +30 дней; повторное скачивание не продлевает поддержку и не создаёт вторую лицензию', async () => {
    const store = new MemoryTransferStore();
    const first = await handleTransfer(BIZ_ID, deps(store));
    const later = new Date(NOW.getTime() + 10 * 86_400_000);
    const second = await handleTransfer(BIZ_ID, deps(store, later));
    expect(store.b.support_until).toBe('2026-11-14');
    expect(first.ok && first.first_time).toBe(true);
    expect(second.ok && second.first_time).toBe(false);
    expect(store.licenses_created).toBe(1);
    if (second.ok) expect(splitTransferText(second.text)['README.md']).toContain('до 2026-11-14');
  });

  it('ошибки: неверный id 400, нет бизнеса 404, не клиент 409', async () => {
    expect(await handleTransfer('x', deps(new MemoryTransferStore()))).toMatchObject({ http_status: 400 });
    expect(await handleTransfer('44444444-4444-4444-8444-444444444444', deps(new MemoryTransferStore()))).toMatchObject({ http_status: 404 });
    expect(await handleTransfer(BIZ_ID, deps(new MemoryTransferStore({ status: 'sent' })))).toMatchObject({ http_status: 409, reason: 'not_client' });
  });

  it('MIGRATIONS перечисляет все файлы supabase/migrations по порядку', () => {
    const onDisk = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
    expect(MIGRATION_FILES.map((f) => f.split('/').pop())).toEqual(onDisk);
  });

  it('имя файла безопасно для Content-Disposition', () => {
    expect(transferFileName('Ромашка "x"/../a')).toBe('transfer-x-a.txt');
    expect(transferFileName('---')).toBe('transfer-site.txt');
  });

  it('без мастер-секрета ключ пустой, но файл отдаётся', () => {
    const text = buildTransferText({ business_name: 'B', license_id: LIC_ID, license_key: null, server_url: 'https://s', domain: null, support_until: '2026-11-14' });
    expect(splitTransferText(text)['.env.example']).toContain('LICENSE_HMAC_SECRET=\n');
  });

  it('GET /api/transfer/[id]: 401 без прав; text/plain attachment, no-store, maxDuration 10', async () => {
    const mod = await import('../app/api/transfer/[id]/route');
    expect(mod.maxDuration).toBe(10);
    env.store = new MemoryTransferStore();
    env.admin = false;
    expect((await mod.GET(new Request('https://svc.example'), { params: { id: BIZ_ID } })).status).toBe(401);
    env.admin = true;
    const res = await mod.GET(new Request('https://svc.example'), { params: { id: BIZ_ID } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="transfer-romashka.txt"');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(await res.text()).toContain('=== README.md ===');
  });
});

describe('transfer → лицензия клиента: сквозной сценарий', () => {
  // .env.example из transfer-файла → конфиг клиента → подписанный ping → серверный handlePing → подписанный ответ.
  function envFrom(text: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const line of splitTransferText(text)['.env.example'].split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (m) env[m[1]] = m[2];
    }
    return env;
  }

  function serverFetch(lic: LicenseRow) {
    const store: LicenseStore = {
      findLicense: async (id) => (id === lic.license_id ? lic : null),
      recordPing: async () => undefined,
      hasRecentSignal: async () => false,
      bindDomain: async () => undefined,
    };
    return async (_url: string, init: RequestInit): Promise<Response> => {
      const headers = new Headers(init.headers);
      const r = await handlePing(
        { raw_body: String(init.body), signature: headers.get('X-License-Signature'), ip: null, user_agent: null },
        { store, alert: async () => undefined, master_secret: MASTER },
      );
      return new Response(r.body, { status: r.http_status, headers: r.signature ? { 'X-License-Signature': r.signature } : {} });
    };
  }

  it('ключ из transfer-файла принимается сервером: active на своём домене, unverified на чужом', async () => {
    const r = await handleTransfer(BIZ_ID, deps(new MemoryTransferStore()));
    if (!r.ok) throw new Error('transfer failed');
    const cfg = readLicenseConfig(envFrom(r.text));
    expect(cfg).not.toBeNull();
    if (!cfg) return;
    const lic: LicenseRow = { license_id: LIC_ID, domain: 'romashka.ru', allowed_domains: ['romashka.ru'], revoked: false };
    expect(await sendPing(cfg, 'romashka.ru', '1.0.0', serverFetch(lic))).toEqual({ ok: true, status: 'active' });
    expect(await sendPing(cfg, 'stolen.ru', '1.0.0', serverFetch(lic))).toEqual({ ok: true, status: 'unverified' });
    expect(await sendPing(cfg, 'romashka.ru', '1.0.0', serverFetch({ ...lic, revoked: true }))).toEqual({ ok: true, status: 'blocked' });
  });

  it('ключ одной лицензии не подходит для другой', async () => {
    const r = await handleTransfer(BIZ_ID, deps(new MemoryTransferStore()));
    if (!r.ok) throw new Error('transfer failed');
    const cfg = readLicenseConfig(envFrom(r.text));
    if (!cfg) throw new Error('no config');
    const other = '55555555-5555-4555-8555-555555555555';
    const lic: LicenseRow = { license_id: other, domain: 'other.ru', allowed_domains: [], revoked: false };
    // Сервер отвечает 401 (подпись запроса не сошлась) — для клиента это сбой, а не статус.
    expect(await sendPing({ ...cfg, license_id: other }, 'other.ru', '1', serverFetch(lic))).toEqual({ ok: false, reason: 'http' });
  });
});
