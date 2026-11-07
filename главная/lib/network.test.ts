// Тесты обёртки отказа server action.
import { describe, expect, it } from 'vitest';
import { MSG_NETWORK, orNetworkError } from './network';

describe('orNetworkError', () => {
  it('успешный результат проходит как есть', async () => {
    expect(await orNetworkError(Promise.resolve({ ok: true, message: 'Готово' }))).toEqual({ ok: true, message: 'Готово' });
  });
  it('отказ action из сервера (ok=false) не подменяется', async () => {
    expect(await orNetworkError(Promise.resolve({ ok: false, error: 'Бизнес не найден' }))).toEqual({ ok: false, error: 'Бизнес не найден' });
  });
  it('отклонённый промис — отказ с понятным текстом', async () => {
    expect(await orNetworkError(Promise.reject(new TypeError('Failed to fetch')))).toEqual({ ok: false, error: MSG_NETWORK });
  });
});
