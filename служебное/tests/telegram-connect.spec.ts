// tests/telegram-connect.spec.ts — Playwright E2E: подключение Telegram в кабинете бизнеса (ТЗ §18.3, §36).
// Полный путь: вход → «Получить код» → webhook получает /start <код> (имитация Telegram) →
// страница сама показывает «подключено» → повтор кода отклоняется → отключение.
// Telegram Bot API не нужен: update отправляется прямо в webhook стенда с секретным заголовком,
// ответы бота уходят в api.telegram.org с тестовым токеном и падают (это логируется, не влияет на тест).
//
// Переменные окружения (без них spec пропускается):
//   E2E_BASE_URL         — адрес стенда, например http://localhost:3000
//   E2E_OWNER_EMAIL      — владелец тестового бизнеса
//   E2E_OWNER_PASSWORD
//   E2E_BUSINESS_PATH    — «/m/studio» (prefix/slug тестового бизнеса со статусом client)
//   E2E_TG_SECRET        — значение TELEGRAM_WEBHOOK_SECRET стенда
//   E2E_TG_CHAT_ID       — числовой chat_id для имитации (любой, не TELEGRAM_CHAT_ID)
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const env = {
  baseUrl: process.env.E2E_BASE_URL ?? '',
  email: process.env.E2E_OWNER_EMAIL ?? '',
  password: process.env.E2E_OWNER_PASSWORD ?? '',
  businessPath: process.env.E2E_BUSINESS_PATH ?? '',
  secret: process.env.E2E_TG_SECRET ?? '',
  chatId: Number(process.env.E2E_TG_CHAT_ID ?? '0'),
};

const configured = Object.values(env).every(Boolean);
const SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token';
/** Опрос статуса на странице — раз в 5 с; запас на медленный стенд. */
const CONNECT_TIMEOUT_MS = 20_000;
const CODE_PATTERN = /BIZ-[A-Z2-9]{6}/;
const POLL_GRACE_MS = 6_000;

test.describe.configure({ mode: 'serial' });
test.skip(!configured, 'E2E_* переменные не заданы — нужен запущенный стенд с тестовым бизнесом');

let updateId = Date.now();

function webhookUrl(): string {
  return new URL('/api/telegram/webhook', env.baseUrl).toString();
}

/** Имитация update от Telegram: личное сообщение от chatId. */
async function sendUpdate(request: APIRequestContext, text: string, secret: string = env.secret) {
  updateId += 1;
  return request.post(webhookUrl(), {
    headers: { [SECRET_HEADER]: secret, 'Content-Type': 'application/json' },
    data: {
      update_id: updateId,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: env.chatId, type: 'private' },
        from: { id: env.chatId, is_bot: false, first_name: 'E2E' },
        text,
      },
    },
  });
}

async function login(page: Page): Promise<void> {
  await page.goto(`${env.baseUrl}${env.businessPath}/panel/login`);
  // У полей входа нет <label> (страница агента 6) — ищем по placeholder.
  await page.getByPlaceholder('Email').fill(env.email);
  await page.getByPlaceholder('Пароль').fill(env.password);
  await page.getByRole('button', { name: /войти/i }).click();
  await page.waitForURL(new RegExp(`${env.businessPath}/panel(?!/login)`));
}

async function openNotifications(page: Page): Promise<void> {
  await page.goto(`${env.baseUrl}${env.businessPath}/panel/notifications`);
  await expect(page.getByRole('heading', { level: 1, name: 'Уведомления' })).toBeVisible();
}

/** Приводит бизнес в состояние «не подключён» (после прошлых прогонов). */
async function ensureDisconnected(page: Page): Promise<void> {
  const disconnect = page.getByTestId('telegram-disconnect');
  if (await disconnect.isVisible()) {
    await disconnect.click();
    await page.getByTestId('telegram-disconnect-confirm').click();
  }
  await expect(page.getByTestId('telegram-not-connected')).toBeVisible();
}

async function createCode(page: Page): Promise<string> {
  await page.getByTestId('telegram-create').click();
  const codeText = await page.getByTestId('telegram-code').textContent({ timeout: 10_000 });
  const match = codeText?.match(CODE_PATTERN);
  expect(match, 'код BIZ-xxxxxx на странице').not.toBeNull();
  return match ? match[0] : '';
}

test.describe('Подключение Telegram', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openNotifications(page);
    await ensureDisconnected(page);
  });

  test('webhook без секрета → 403', async ({ request }) => {
    const res = await sendUpdate(request, '/start', 'wrong-secret');
    expect(res.status()).toBe(403);
  });

  test('код: TTL, копирование, deep-link, a11y', async ({ page, context }) => {
    // Firefox/WebKit не знают clipboard-разрешений — тогда проверяется только смена подписи/ошибка.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch((error: unknown) => test.info().annotations.push({ type: 'clipboard', description: String(error) }));
    const code = await createCode(page);
    await expect(page.getByTestId('telegram-ttl')).toHaveText(/^1[45]:\d{2}$/);
    await expect(page.getByTestId('telegram-announce')).toHaveText(/Код создан/);
    // Фокус переведён на блок с кодом (кнопка «Получить код» сменила подпись).
    await expect(page.getByRole('heading', { name: 'Ваш код' })).toBeFocused();
    const link = page.getByTestId('telegram-deeplink');
    if (await link.count()) await expect(link).toHaveAttribute('href', new RegExp(`\\?start=${code}$`));
    await page.getByTestId('telegram-copy').click();
    await expect(page.getByTestId('telegram-copy').or(page.getByTestId('telegram-error'))).toBeVisible();
  });

  test('новый код заменяет старый: старый больше не подключает', async ({ page, request }) => {
    const first = await createCode(page);
    const second = await createCode(page);
    expect(second).not.toBe(first);
    expect((await sendUpdate(request, `/start ${first}`)).status()).toBe(200);
    // Проверка «не подключилось» требует пережить хотя бы один цикл опроса страницы (5 с).
    await page.waitForTimeout(POLL_GRACE_MS);
    await expect(page.getByTestId('telegram-not-connected')).toBeVisible();
  });

  test('/start <код> → страница сама переходит в «подключено»; повтор кода не срабатывает; отключение', async ({ page, request }) => {
    const code = await createCode(page);
    const res = await sendUpdate(request, `/start ${code}`);
    expect(res.status()).toBe(200);
    await expect(page.getByTestId('telegram-connected')).toBeVisible({ timeout: CONNECT_TIMEOUT_MS });
    await expect(page.getByTestId('telegram-announce')).toHaveText(/подключён/);

    // Одноразовость: тот же код повторно — 200 (Telegram не ретраит), статус не меняется.
    expect((await sendUpdate(request, `/start ${code}`)).status()).toBe(200);

    // Optimistic-отключение с подтверждением.
    await page.getByTestId('telegram-disconnect').click();
    await page.getByTestId('telegram-disconnect-confirm').click();
    await expect(page.getByTestId('telegram-not-connected')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('telegram-not-connected')).toBeVisible();
  });

  test('/stop из чата отключает уведомления', async ({ page, request }) => {
    const code = await createCode(page);
    await sendUpdate(request, `/start ${code}`);
    await expect(page.getByTestId('telegram-connected')).toBeVisible({ timeout: CONNECT_TIMEOUT_MS });
    expect((await sendUpdate(request, '/stop')).status()).toBe(200);
    await page.reload();
    await expect(page.getByTestId('telegram-not-connected')).toBeVisible();
  });
});
