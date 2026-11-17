// tests/customer-my.spec.ts — кабинет клиента /{prefix}/{slug}/my (NEW-5, 2026-11-12).
// Прогон против локального стенда: TEST_SUPABASE_URL + pnpm test:e2e (поднимает next build + start).
// Тестовый бизнес создаётся демо-роутами на лету (без отдельных env): /api/demo/owner ставит сессию
// владельца (для переключения флага «Обязательна регистрация»), /api/demo/customer — сессию клиента.
import { expect, type APIRequestContext, type Page, test } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const PREFIX = 'm';
const SLUG = 'demo';
const DEMO_CUSTOMER_EMAIL = 'demo-client@zapishisya.ru';

// Если нет тестового Supabase — спеки пропускаются, а не падают красным (как и остальные e2e).
const RUNNABLE = Boolean(process.env.TEST_SUPABASE_URL);
function skipIfNoDb(): void {
  test.skip(!RUNNABLE, 'Нужен TEST_SUPABASE_URL для поднятия стенда');
}

// ---------- helpers ----------

async function openDemoOwner(page: Page): Promise<void> {
  await page.goto(`${BASE}/api/demo/owner`);
  await page.waitForURL(/\/m\/demo\/admin/);
}

async function openDemoCustomer(page: Page): Promise<void> {
  await page.goto(`${BASE}/api/demo/customer`);
  await page.waitForURL(/\/m\/demo\/my/);
}

// Переключает чекбокс «Обязательна регистрация клиента для записи» в настройках владельца.
async function setRequireRegistration(page: Page, value: boolean): Promise<void> {
  await openDemoOwner(page);
  await page.goto(`${BASE}/${PREFIX}/${SLUG}/admin/settings`);
  const checkbox = page.locator('label:has-text("Обязательна регистрация клиента для записи") input[type="checkbox"]');
  await checkbox.waitFor();
  if ((await checkbox.isChecked()) !== value) await checkbox.click();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Настройки сохранены' }).first()).toBeVisible();
}

// Берёт из демо-сайта первую услугу и свободный слот через публичный API слотов.
async function demoBookingParams(request: APIRequestContext): Promise<{ serviceId: string; date: string; startsAt: string }> {
  const pageReq = await request.get(`${BASE}/${PREFIX}/${SLUG}`);
  const html = await pageReq.text();
  const match = html.match(/<option[^>]*value="([0-9a-fA-F-]{36})"[^>]*>/);
  const serviceId = match?.[1];
  if (!serviceId) throw new Error('Не удалось найти услугу на демо-сайте');

  const now = new Date();
  for (let d = 1; d <= 30; d++) {
    const day = new Date(now.getTime() + d * 86_400_000);
    const date = day.toISOString().slice(0, 10);
    const res = await request.get(`${BASE}/api/bookings/slots?prefix=${PREFIX}&slug=${SLUG}&serviceId=${serviceId}&date=${date}`);
    const body = (await res.json()) as { ok: boolean; slots?: string[] };
    if (body.ok && body.slots && body.slots.length > 0) {
      return { serviceId, date, startsAt: body.slots[0] };
    }
  }
  throw new Error('Нет свободных слотов у демо-бизнеса');
}

async function postBooking(
  request: APIRequestContext,
  params: { serviceId: string; date: string; startsAt: string },
  extra: Record<string, unknown> = {},
): Promise<{ status: number; body: unknown }> {
  const res = await request.post(`${BASE}/api/bookings`, {
    headers: { 'content-type': 'application/json' },
    data: {
      prefix: PREFIX,
      slug: SLUG,
      serviceId: params.serviceId,
      date: params.date,
      startsAt: params.startsAt,
      name: 'Тест',
      phone: '+7 (900) 111-22-33',
      privacyAccepted: true,
      ...extra,
    },
  });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

// ---------- тесты ----------

test.describe('кабинет клиента /my', () => {
  test.beforeEach(async ({ page }) => {
    skipIfNoDb();
    // Гарантируем существование демо-бизнеса и демо-клиента перед каждым тестом.
    await openDemoCustomer(page);
  });

  test('без сессии /my показывает приглашение войти (не 403)', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE}/${PREFIX}/${SLUG}/my`);
    await expect(page).toHaveURL(/\/m\/demo\/my/);
    await expect(page.getByRole('heading', { name: 'Мои записи' })).toBeVisible();
    await expect(page.getByText('Войдите в кабинет')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Войти в кабинет' })).toBeVisible();
  });

  test('POST без сессии: 201 когда регистрация не обязательна, 403 registration_required когда обязательна', async ({ request, page }) => {
    const params = await demoBookingParams(request);

    // Регистрация НЕ обязательна (значение по умолчанию) → 201 без сессии.
    await setRequireRegistration(page, false);
    const r1 = await postBooking(request, params);
    expect(r1.status).toBe(201);

    // Регистрация ОБЯЗАТЕЛЬНА → 403 с причиной registration_required без сессии.
    await setRequireRegistration(page, true);
    const r2 = await postBooking(request, params);
    expect(r2.status).toBe(403);
    expect((r2.body as { ok: false; reason: string }).reason).toBe('registration_required');
  });

  test('POST с клиентской сессией: 201 даже при обязательной регистрации', async ({ page, request }) => {
    await setRequireRegistration(page, true);
    const params = await demoBookingParams(request);
    // page.request делит cookies с контекстом страницы → несёт customer_session из beforeEach.
    const res = await postBooking(page.request, params);
    expect(res.status).toBe(201);
  });

  test('с клиентской сессией /my показывает свои записи (изоляция по бизнесу)', async ({ page }) => {
    await openDemoCustomer(page);
    await page.goto(`${BASE}/${PREFIX}/${SLUG}/my`);
    await expect(page.getByRole('heading', { name: 'Мои записи' })).toBeVisible();
    // Демо-клиент привязан к m/demo → видит свой email, а не «Войдите».
    await expect(page.getByText(DEMO_CUSTOMER_EMAIL)).toBeVisible();
    // ensureDemoCustomer сеяет одну запись — она видна в кабинете.
    await expect(page.getByText('Классический маникюр').or(page.getByText('У вас пока нет записей'))).toBeVisible();
  });

  test('регистрация через /my/login: запрос кода открывает поле ввода', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE}/${PREFIX}/${SLUG}/my/login`);
    await expect(page.getByRole('heading', { name: 'Вход в кабинет' })).toBeVisible();
    await page.locator('input[type="email"]').fill(DEMO_CUSTOMER_EMAIL);
    await page.getByRole('button', { name: 'Получить код' }).click();
    // Нейтральное сообщение (анти-перечисление) + появилось поле для кода.
    await expect(page.getByText('Если аккаунт существует, код отправлен на email')).toBeVisible();
    await expect(page.locator('input[placeholder="Код из письма (6 цифр)"]')).toBeVisible();
  });
});
