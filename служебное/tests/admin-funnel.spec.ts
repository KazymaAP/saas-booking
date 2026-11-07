// tests/admin-funnel.spec.ts — воронка супер-админки (ТЗ §13.2): доступ, 5 шагов, фильтры в URL, a11y, burger.
import { expect, test } from '@playwright/test';
import { isMobile, loginAsAdmin, requireAdmin, requireApp } from './admin-helpers';

test.describe('без входа', () => {
  requireApp();

  test('страница воронки уводит на вход', async ({ page }) => {
    await page.goto('/panel/funnel');
    await expect(page).toHaveURL(/\/panel\/login/);
  });

  test('/panel → /panel/funnel → вход', async ({ page }) => {
    await page.goto('/panel');
    await expect(page).toHaveURL(/\/panel\/login/);
  });
});

test.describe('супер-админ', () => {
  requireAdmin();
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('пять шагов с заголовками и счётчиками', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Воронка' })).toBeVisible();
    for (const [n, title] of [
      [1, 'Выбрать клиентов'],
      [2, 'Сгенерировать прототипы'],
      [3, 'Проверить и одобрить'],
      [4, 'Отправить письмо'],
      [5, 'Дашборд рассылки'],
    ] as const) {
      // sr-only «Шаг N.» входит в доступное имя заголовка.
      await expect(page.getByRole('heading', { level: 2, name: new RegExp(`Шаг ${n}\\. ${title}`) })).toBeVisible();
    }
    for (const label of ['Отправлено', 'Открыто', 'Клик', 'Ответили', 'Оплатили']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('фильтр шага 1 — GET-форма, параметры попадают в URL', async ({ page }) => {
    const filter = page.getByRole('form', { name: 'Фильтр новых бизнесов' });
    await filter.getByLabel('Город').fill('Казань');
    await filter.getByLabel(/email/i).check();
    await filter.getByRole('button').first().click();
    await expect(page).toHaveURL(/city=%D0%9A|city=Казань/);
    await expect(page).toHaveURL(/email=/);
    // Значение фильтра сохраняется после перехода.
    await expect(page.getByRole('form', { name: 'Фильтр новых бизнесов' }).getByLabel('Город')).toHaveValue('Казань');
  });

  test('массовая кнопка неактивна, пока ничего не выбрано', async ({ page }) => {
    const step1 = page.getByRole('region', { name: /Шаг 1\./ });
    // Ждём конец стриминга: пока виден скелетон loading.tsx, count() = 0 и тест молча уходил в skip.
    await expect(step1.getByRole('heading', { level: 2 })).toBeVisible();
    const work = step1.getByRole('button', { name: /^В работу/ });
    if ((await work.count()) === 0) test.skip(true, 'В шаге 1 нет бизнесов — таблица пустая');
    await expect(work).toBeDisabled();
    // Чекбокс строки — по доступному имени «Выбрать «…»» (в шаге есть ещё фильтр «есть email» и «выбрать все»).
    await step1.getByRole('checkbox', { name: /^Выбрать «/ }).first().check();
    await expect(work).toBeEnabled();
    await expect(work).toHaveText(/\(1\)/);
    await expect(step1.getByText(/^Выбрано: 1 из/)).toBeVisible();
    // «Выбрать все» → счётчик равен числу строк на странице, повторно — снимает выбор.
    const all = step1.getByRole('checkbox', { name: /Выбрать все/ }).first();
    await all.check();
    await expect(work).not.toHaveText(/\(1\)/);
    await all.uncheck();
    await expect(work).toBeDisabled();
  });

  test('навигация: активный пункт помечен aria-current, есть skip-link', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Разделы супер-админки' });
    if (isMobile(page)) {
      const burger = nav.getByRole('button', { name: 'Открыть меню' });
      await expect(burger).toHaveAttribute('aria-expanded', 'false');
      await burger.click();
      await expect(nav.getByRole('button', { name: 'Закрыть меню' })).toHaveAttribute('aria-expanded', 'true');
      await expect(nav.getByRole('link', { name: 'Воронка' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(nav.getByRole('link', { name: 'Воронка' })).toBeHidden();
      await burger.click();
    }
    await expect(nav.getByRole('link', { name: 'Воронка' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Бизнесы' })).not.toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toHaveAttribute('href', '#panel-main');
  });
});
