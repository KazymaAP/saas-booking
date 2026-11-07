// tests/backup.spec.ts — e2e бэкапа и transfer: защита маршрутов (CRON_SECRET, isSuperAdmin), подтверждение restore.
// Полный цикл (бэкап → restore) — только при E2E_CRON_SECRET на тестовом стенде: он пишет файл в bucket backups.
import { expect, test } from '@playwright/test';

const CRON_SECRET = process.env.E2E_CRON_SECRET ?? '';
const SOME_ID = '00000000-0000-4000-8000-000000000000';

test.describe('GET /api/cron/backup', () => {
  test('без токена и с неверным токеном → 401', async ({ request }) => {
    expect((await request.get('/api/cron/backup')).status()).toBe(401);
    expect((await request.get('/api/cron/backup', { headers: { authorization: 'Bearer wrong' } })).status()).toBe(401);
  });

  test('с CRON_SECRET создаёт копию 9 таблиц; ответ без данных таблиц', async ({ request }) => {
    test.skip(!CRON_SECRET, 'нужен E2E_CRON_SECRET (тестовый стенд)');
    const res = await request.get('/api/cron/backup', { headers: { authorization: `Bearer ${CRON_SECRET}` }, timeout: 300_000 });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.file).toMatch(/^backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(Object.keys(body.counts).sort()).toEqual(
      ['admin_users', 'bookings', 'businesses', 'emails_outgoing', 'licenses', 'outreach_log', 'photos', 'services', 'vertical_templates'],
    );
    expect(body).not.toHaveProperty('tables');
  });
});

test.describe('POST /api/backup/restore', () => {
  test('без сессии супер-админа → 401 даже с верным подтверждением', async ({ request }) => {
    const res = await request.post('/api/backup/restore', { data: { file: 'backup-2026-01-01.json', confirm: 'ВОССТАНОВИТЬ' } });
    expect(res.status()).toBe(401);
  });
});

test.describe('GET /api/transfer/[id]', () => {
  test('без сессии супер-админа → 401, файл не отдаётся', async ({ request }) => {
    const res = await request.get(`/api/transfer/${SOME_ID}`);
    expect(res.status()).toBe(401);
    expect(res.headers()['content-disposition']).toBeUndefined();
  });
});

test.describe('/panel/backup', () => {
  test('без входа страница не показывает копии и ссылки на скачивание', async ({ page }) => {
    await page.goto('/panel/backup');
    await expect(page.getByRole('link', { name: /Скачать копию/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Восстановить' })).toHaveCount(0);
  });
});
