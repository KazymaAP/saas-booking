// lib/customer-session.test.ts — юнит-тесты сессии клиента кабинета /my (NEW-5).
// Подмены (cookies, adminClient, verifyAccessToken) — из ./__test__/setup.
import './__test__/setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authProvider from './auth-provider';
import { verifyJwtHs256 } from './auth-core';
import {
  CUSTOMER_COOKIE,
  createCustomer,
  endCustomerSession,
  findCustomerByEmail,
  readCustomerSession,
  startCustomerSession,
} from './customer-session';
import { cookiesMock, fakeDb, jar, resetHarness, seed } from './__test__/harness';

const SECRET = 'test-customer-secret';
const BUSINESS_A = 'biz-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BUSINESS_B = 'biz-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

beforeEach(() => {
  resetHarness();
  process.env.SUPABASE_JWT_SECRET = SECRET;
  // verifyAccessToken проверяет подпись так же, как реальный токен Supabase (HS256).
  vi.mocked(authProvider.verifyAccessToken).mockImplementation(async (token: string) =>
    verifyJwtHs256(token, SECRET, new Date()),
  );
  seed('customers', []);
});

describe('findCustomerByEmail', () => {
  it('находит по (business_id, email) с нормализацией регистра', async () => {
    seed('customers', [{ id: 'c1', business_id: BUSINESS_A, email: 'client@example.ru', name: 'Клиент' }]);
    const found = await findCustomerByEmail(BUSINESS_A, 'Client@Example.ru');
    expect(found?.id).toBe('c1');
  });

  it('не находит клиента другого бизнеса (изоляция)', async () => {
    seed('customers', [{ id: 'c1', business_id: BUSINESS_A, email: 'client@example.ru' }]);
    const found = await findCustomerByEmail(BUSINESS_B, 'client@example.ru');
    expect(found).toBeNull();
  });

  it('возвращает null на несуществующий email', async () => {
    expect(await findCustomerByEmail(BUSINESS_A, 'nobody@example.ru')).toBeNull();
  });
});

describe('createCustomer', () => {
  it('создаёт клиента, если его нет', async () => {
    const c = await createCustomer(BUSINESS_A, 'new@example.ru', { name: 'Новый' });
    expect(c.id).toBeTruthy();
    expect(c.email).toBe('new@example.ru');
    // Найдётся в той же записи БД.
    expect(await findCustomerByEmail(BUSINESS_A, 'new@example.ru')).not.toBeNull();
  });

  it('идемпотентен: привязывает auth_user_id к существующему без дубля', async () => {
    const first = await createCustomer(BUSINESS_A, 'dup@example.ru');
    const second = await createCustomer(BUSINESS_A, 'dup@example.ru', { authUserId: 'auth-1' });
    expect(second.id).toBe(first.id);
    expect(second.auth_user_id).toBe('auth-1');
    // Одна строка на (business_id, email) — дублей нет.
    const { data } = await fakeDb.from('customers').select('*').eq('business_id', BUSINESS_A).eq('email', 'dup@example.ru');
    expect(Array.isArray(data) ? data.length : 0).toBe(1);
  });

  it('не перезаписывает уже привязанный auth_user_id', async () => {
    await createCustomer(BUSINESS_A, 'lock@example.ru', { authUserId: 'auth-1' });
    const c = await createCustomer(BUSINESS_A, 'lock@example.ru', { authUserId: 'auth-2' });
    expect(c.auth_user_id).toBe('auth-1');
  });

  it('бросает ошибку на некорректный email', async () => {
    await expect(createCustomer(BUSINESS_A, 'not-an-email')).rejects.toThrow();
  });
});

describe('сессия клиента', () => {
  it('start → read возвращает клиента (круговой цикл токена)', async () => {
    const c = await createCustomer(BUSINESS_A, 'sess@example.ru');
    startCustomerSession({ id: c.id, email: c.email });
    expect(jar.get(CUSTOMER_COOKIE)?.value).toBeTruthy();
    const session = await readCustomerSession(BUSINESS_A);
    expect(session?.customer.id).toBe(c.id);
    expect(session?.email).toBe('sess@example.ru');
  });

  it('изоляция: клиент бизнеса A не читается в бизнесе B', async () => {
    const c = await createCustomer(BUSINESS_A, 'iso@example.ru');
    startCustomerSession({ id: c.id, email: c.email });
    const session = await readCustomerSession(BUSINESS_B);
    expect(session).toBeNull();
    // Токен стёрт при несовпадении бизнеса (cookiesMock.get → undefined для пустого значения).
    expect(cookiesMock.get(CUSTOMER_COOKIE)).toBeUndefined();
  });

  it('нет cookie → null без ошибок', async () => {
    expect(await readCustomerSession(BUSINESS_A)).toBeNull();
  });

  it('битый токен → null и стирает cookie', async () => {
    jar.set(CUSTOMER_COOKIE, { value: 'not.a.jwt' });
    expect(await readCustomerSession(BUSINESS_A)).toBeNull();
    expect(cookiesMock.get(CUSTOMER_COOKIE)).toBeUndefined();
  });

  it('endCustomerSession стирает cookie (maxAge 0)', async () => {
    const c = await createCustomer(BUSINESS_A, 'end@example.ru');
    startCustomerSession({ id: c.id, email: c.email });
    await endCustomerSession();
    expect(cookiesMock.get(CUSTOMER_COOKIE)).toBeUndefined();
  });
});

describe('SUPABASE_JWT_SECRET', () => {
  it('отсутствие секрета → ошибка подписи сессии', async () => {
    delete process.env.SUPABASE_JWT_SECRET;
    await expect(createCustomer(BUSINESS_A, 'x@example.ru').then((c) => startCustomerSession({ id: c.id, email: c.email })))
      .rejects.toThrow();
  });
});
