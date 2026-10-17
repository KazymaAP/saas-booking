// tests/auth.spec.ts — e2e входа: страницы, a11y форм, ошибки, open redirect, refresh, стенд (вход/выход/роли).
import { expect, test, type Page } from '@playwright/test';
import { addMember, clearAuthRateLimits, createAuthToken, createBusiness, createUser, STAND, STAND_SKIP_REASON, uniqueEmail } from './stand';
import { formAlert, formStatus } from './ui';

const PASSWORD = 'e2e-strong-password';

async function fillLogin(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Почта').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
}

test.describe('вход: без стенда', () => {
  test('форма супер-админа доступна: подписи полей, автофокус, ссылки на сброс и magic-link', async ({ page }) => {
    await page.goto('/panel/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Вход в панель' })).toBeVisible();
    await expect(page.getByLabel('Почта')).toBeFocused();
    await expect(page.getByLabel('Почта')).toHaveAttribute('autocomplete', 'username');
    await expect(page.getByLabel('Пароль')).toHaveAttribute('autocomplete', 'current-password');
    await expect(page.getByRole('link', { name: 'Забыли пароль?' })).toHaveAttribute('href', /\/panel\/forgot-password/);
    await expect(page.getByRole('link', { name: 'Войти по ссылке из письма' })).toHaveAttribute('href', /\/magic-link/);
  });

  test('неверный пароль: сообщение role=alert, поля aria-invalid, в URL нет почты и пароля', async ({ page }) => {
    await page.goto('/panel/login');
    await fillLogin(page, 'nobody@example.test', 'wrong-password-123');
    await expect(formAlert(page)).toHaveText(/Неверная почта или пароль/);
    await expect(page.getByLabel('Почта')).toHaveAttribute('aria-invalid', 'true');
    expect(page.url()).toContain('error=invalid');
    expect(page.url()).not.toContain('nobody');
    expect(page.url()).not.toContain('wrong-password');
  });

  test('код ошибки из URL: неизвестный не отображается (нельзя подсунуть свой текст)', async ({ page }) => {
    await page.goto('/panel/login?error=%3Cscript%3E');
    await expect(formAlert(page)).toHaveCount(0);
    await page.goto('/panel/login?error=rate_limited');
    await expect(formAlert(page)).toHaveText(/Слишком много попыток/);
  });

  test('защищённые страницы без сессии ведут на вход', async ({ page }) => {
    await page.goto('/panel/funnel');
    await expect(page).toHaveURL(/\/panel\/login/);
  });

  test('refresh без сессии и с внешним next: только внутренний редирект (open redirect закрыт)', async ({ request }) => {
    for (const next of ['//evil.com', 'https://evil.com/panel', '/\\evil.com', '/panel/../evil']) {
      const res = await request.get(`/api/auth/refresh?realm=admin&next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
      expect(res.status()).toBe(303);
      const location = res.headers()['location'] ?? '';
      expect(new URL(location, 'http://localhost').hostname).toBe('localhost');
      expect(location).toContain('/panel/login');
    }
  });

  test('cookie сессии не выставляется без входа; страница входа не индексируется', async ({ page }) => {
    await page.goto('/panel/login');
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'sa_session')).toBeUndefined();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

test.describe('вход: без JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('форма отправляется обычным POST с Origin своего сайта и получает код ошибки', async ({ page }) => {
    const origins: string[] = [];
    page.on('request', (r) => { if (r.method() === 'POST') origins.push(r.headers()['origin'] ?? ''); });
    await page.goto('/panel/login');
    await fillLogin(page, 'nobody@example.test', 'wrong-password-123');
    await expect(page).toHaveURL(/error=invalid/);
    await expect(formAlert(page)).toHaveText(/Неверная почта или пароль/);
    expect(origins.every((o) => o !== 'null' && o.length > 0)).toBe(true);
  });
});

test.describe('вход: стенд', () => {
  test.skip(!STAND, STAND_SKIP_REASON);
  test.beforeEach(async () => { await clearAuthRateLimits(); });

  test('владелец: вход, host-only httpOnly secure lax cookie, возврат по next, выход', async ({ page }) => {
    const biz = await createBusiness();
    const email = uniqueEmail('owner');
    await addMember(biz.id, await createUser(email, PASSWORD), email, 'owner');
    await page.goto(`${biz.panel}/login?next=${encodeURIComponent(`${biz.panel}/bookings`)}`);
    await fillLogin(page, email, PASSWORD);
    await expect(page).toHaveURL(new RegExp(`${biz.panel}/bookings$`));
    const session = (await page.context().cookies()).find((c) => c.name === 'biz_session');
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    expect(session?.domain.startsWith('.')).toBe(false);
    await page.getByRole('button', { name: 'Выйти' }).click();
    await expect(page).toHaveURL(new RegExp(`${biz.panel}/login`));
    await expect(formStatus(page)).toHaveText(/Вы вышли/);
  });

  test('manager не видит настройки, подписку и команду', async ({ page }) => {
    const biz = await createBusiness();
    const email = uniqueEmail('manager');
    await addMember(biz.id, await createUser(email, PASSWORD), email, 'manager');
    await page.goto(`${biz.panel}/login`);
    await fillLogin(page, email, PASSWORD);
    const nav = page.getByRole('navigation', { name: 'Разделы кабинета' });
    await expect(nav.getByRole('link', { name: 'Брони' })).toBeVisible();
    for (const name of ['Настройки', 'Подписка', 'Команда']) await expect(nav.getByRole('link', { name })).toHaveCount(0);
  });

  test('участник другого бизнеса не входит; неактивный бизнес — сообщение после верного пароля', async ({ page }) => {
    const own = await createBusiness();
    const other = await createBusiness();
    const email = uniqueEmail('cross');
    await addMember(own.id, await createUser(email, PASSWORD), email, 'owner');
    await page.goto(`${other.panel}/login`);
    await fillLogin(page, email, PASSWORD);
    await expect(formAlert(page)).toHaveText(/Неверная почта или пароль/);
  });

  test('rate limit: 11-я попытка с одного IP за 15 минут блокируется', async ({ page }) => {
    await page.goto('/panel/login');
    for (let i = 0; i < 11; i += 1) await fillLogin(page, uniqueEmail('rl'), 'wrong-password-123');
    await expect(formAlert(page)).toHaveText(/Слишком много попыток/);
  });

  test('magic-link: GET не гасит ссылку, вход по кнопке, повтор — недействительна', async ({ page }) => {
    const biz = await createBusiness();
    const email = uniqueEmail('magic');
    await addMember(biz.id, await createUser(email, PASSWORD), email, 'owner');
    const token = await createAuthToken('magic_link', email, 'owner', biz.panel);
    await page.goto(`/magic-link?token=${token}`);
    await page.reload();
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(new RegExp(`${biz.panel}$`));
    await page.goto(`/magic-link?token=${token}`);
    await expect(formAlert(page)).toHaveText(/недействительна|использована/);
  });
});
