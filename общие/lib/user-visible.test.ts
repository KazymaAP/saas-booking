// user-visible.test.ts — сторожевые проверки экранов, которые видит клиент.
// Каждая проверка закрывает конкретную регрессию, найденную при аудите интерфейса:
//  1) на странице входа клиента висела внутренняя пометка «Временная форма… (NEW-6)»;
//  2) «Мои записи» показывали время в UTC (пояс сервера) и не давали отменить/перенести запись,
//     хотя текст обещал эту возможность;
//  3) панель успеха после записи обещала ссылку в письме, которого нет при пустом email.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
// Комментарии разработчика видны только в коде: проверяем то, что попадает в разметку.
const withoutComments = (src: string): string =>
  src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
    .join('\n');

describe('экраны клиента', () => {
  it('вход клиента не показывает внутренних пометок разработки', () => {
    const src = withoutComments(read('app/[prefix]/[slug]/my/login/page.tsx'));
    expect(src).not.toMatch(/NEW-\d/);
    expect(src).not.toMatch(/Временная форма/);
    expect(src).not.toMatch(/будет объединена/);
  });

  it('«Мои записи» показывают время в поясе бизнеса', () => {
    const src = read('app/[prefix]/[slug]/my/page.tsx');
    expect(src).toMatch(/businessTimeZone\(r\.business\)/);
    expect(src).toMatch(/formatSlotDateTime\(b\.scheduled_at, timeZone\)/);
    // Форматирование без timeZone берёт пояс сервера (на Vercel — UTC).
    expect(src).not.toMatch(/new Intl\.DateTimeFormat\('ru-RU', \{ dateStyle/);
  });

  it('«Мои записи» дают отменить и перенести запись', () => {
    const src = read('app/[prefix]/[slug]/my/page.tsx');
    expect(src).toMatch(/cancel_token/);
    expect(src).toMatch(/booking\/cancel\/\$\{b\.cancel_token\}/);
    expect(src).toMatch(/booking\/reschedule\/\$\{b\.cancel_token\}/);
  });

  it('панель успеха показывает ссылки, а не только обещает письмо', () => {
    const src = read('app/[prefix]/[slug]/BookingForm.tsx');
    expect(src).toMatch(/booking\/cancel\/\$\{booking\.cancelToken\}/);
    expect(src).toMatch(/booking\/reschedule\/\$\{booking\.cancelToken\}/);
    expect(src).toMatch(/hasEmail/);
  });
});
