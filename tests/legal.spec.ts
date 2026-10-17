// tests/legal.spec.ts — юридические документы: структура, версия, реквизиты, ссылки, robots, a11y-разметка.
import { expect, test } from '@playwright/test';
import { PRIVACY_VERSION } from '../lib/legal-versions';
import { DISMISS_COOKIE_SCRIPT, LEGAL_PAGES } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(DISMISS_COOKIE_SCRIPT(PRIVACY_VERSION));
});

for (const doc of LEGAL_PAGES) {
  test.describe(doc.path, () => {
    test('один h1 с названием документа, разделы — h2', async ({ page }) => {
      const res = await page.goto(doc.path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(doc.title);
      expect(await page.locator('article section h2').count()).toBeGreaterThanOrEqual(5);
      await expect(page.locator('main#main-content')).toBeVisible();
    });

    test('версия и дата вступления в силу', async ({ page }) => {
      await page.goto(doc.path);
      const times = page.locator('header time');
      await expect(times.first()).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/);
      await expect(page.locator('header dt', { hasText: 'Действует с' })).toBeVisible();
      await expect(page.locator('header dd time').nth(1)).toHaveText(/\d{4} г\./);
    });

    test('блок реквизитов есть, номер карты не публикуется', async ({ page }) => {
      await page.goto(doc.path);
      const requisites = page.locator('section#requisites');
      await expect(requisites).toBeVisible();
      await expect(requisites.getByText('ИНН')).toBeVisible();
      await expect(requisites.getByText('Email')).toBeVisible();
      await expect(requisites).not.toContainText(/карт[аы]/i);
    });

    test('ссылки на связанные документы', async ({ page }) => {
      await page.goto(doc.path);
      for (const href of doc.related) {
        expect(await page.locator(`a[href="${href}"]`).count(), `ссылка на ${href}`).toBeGreaterThan(0);
      }
    });

    test('оглавление ведёт на существующие разделы', async ({ page }) => {
      await page.goto(doc.path);
      const anchors = await page.locator('nav[aria-label="Содержание документа"] a').evaluateAll(
        (links) => links.map((a) => a.getAttribute('href') ?? ''),
      );
      expect(anchors.length).toBeGreaterThan(0);
      for (const anchor of anchors) await expect(page.locator(anchor)).toHaveCount(1);
    });

    test('документ индексируется (нет noindex)', async ({ page }) => {
      const res = await page.goto(doc.path);
      expect(res?.headers()['x-robots-tag'] ?? '').not.toContain('noindex');
      const robots = await page.locator('meta[name="robots"]').getAttribute('content').catch(() => null);
      expect(robots ?? '').not.toContain('noindex');
    });

    test('нет внешних скриптов', async ({ page }) => {
      await page.goto(doc.path);
      const external = await page.locator('script[src]').evaluateAll(
        (scripts) => scripts.map((s) => s.getAttribute('src') ?? '').filter((src) => /^https?:\/\//.test(src) && !src.startsWith(location.origin)),
      );
      expect(external).toEqual([]);
    });
  });
}

test('/privacy: трансграничная передача, сроки, права субъекта, ссылка на /data-request', async ({ page }) => {
  await page.goto('/privacy');
  const main = page.locator('main');
  await expect(main).toContainText('Cloudflare');
  await expect(main).toContainText(/трансграничн/i);
  await expect(main).toContainText(/3 (года|лет)/);
  await expect(main).toContainText(/10 рабочих дней/);
  await expect(main.locator('a[href="/data-request"]').first()).toBeVisible();
  await expect(main.locator('#cookies')).toHaveCount(1);
  await expect(main).toContainText(PRIVACY_VERSION);
});

test('/oferta: цена, оплата, возврат, акцепт', async ({ page }) => {
  await page.goto('/oferta');
  const main = page.locator('main');
  await expect(main).toContainText('₽');
  await expect(main).toContainText(/акцепт/i);
  await expect(main).toContainText(/возврат/i);
  await expect(main).toContainText(/оплат/i);
});

test('/data-request: форма с подписями, noindex, ошибки объявляются', async ({ page }) => {
  await page.goto('/data-request');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const email = page.getByLabel(/email/i).first();
  await expect(email).toBeVisible();
  await expect(email).toHaveAttribute('aria-describedby', /.+/);
  await expect(page.locator('fieldset legend').first()).toBeVisible();
  await expect(page.locator('[role="status"], [aria-live]').first()).toBeAttached();
});
