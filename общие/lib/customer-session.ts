// lib/customer-session.ts — сессия клиента кабинета /{prefix}/{slug}/my (NEW-5, 2026-11-12).
// Клиент — лёгкая запись в таблице customers, привязанная к бизнесу. Сессия — подписанный JWT
// (HS256, тот же секрет SUPABASE_JWT_SECRET, что у токенов Supabase), лежит в cookie customer_session
// (httpOnly, secure, sameSite=lax, path=/, 30 дней). Чтение проверяет подпись через verifyAccessToken
// (lib/auth-provider.ts) — тот же механизм, что и для сессий владельца, но собственный realm 'customer'.
//
// Изоляция между бизнесами: токен содержит только id клиента; при чтении сессии мы ищем клиента по
// (id, business_id). Клиент бизнеса A, попытавшийся открыть /my бизнеса B, не найдёт свою запись в B
// и получит «нет аккаунта» — без раскрытия, существует ли он в другом бизнесе.
import { createHmac } from 'crypto';
import { cookies } from 'next/headers';
import { adminClient } from './supabase';
import { normalizeEmail, SESSION_TTL_SECONDS } from './auth-core';
import { sessionCookieOptions } from './auth-cookies';
import { verifyAccessToken } from './auth-provider';
import type { Customer } from './database.types';

export const CUSTOMER_COOKIE = 'customer_session';
export const CUSTOMER_REALM = 'customer' as const;

export type CustomerSession = { customer: Customer; email: string };

async function findByBusinessAndEmail(businessId: string, email: string): Promise<Customer | null> {
  const { data } = await adminClient()
    .from('customers')
    .select('*')
    .eq('business_id', businessId)
    .eq('email', email)
    .maybeSingle<Customer>();
  return data ?? null;
}

// Поиск клиента по (business_id, email). Нормализует email; несуществующий — null.
export async function findCustomerByEmail(businessId: string, email: string): Promise<Customer | null> {
  const e = normalizeEmail(email);
  if (!e) return null;
  return findByBusinessAndEmail(businessId, e);
}

// Поиск по id в рамках бизнеса (используется при чтении сессии).
async function findByIdAndBusiness(id: string, businessId: string): Promise<Customer | null> {
  const { data } = await adminClient()
    .from('customers')
    .select('*')
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle<Customer>();
  return data ?? null;
}

// Идемпотентное создание/получение клиента. Если передан authUserId — проставляем привязку к Supabase Auth
// (один раз, при первом входе по OTP/паролю). Возвращает актуальную строку.
export async function createCustomer(
  businessId: string,
  email: string,
  opts: { name?: string; phone?: string; authUserId?: string } = {},
): Promise<Customer> {
  const e = normalizeEmail(email);
  if (!e) throw new Error('Некорректный email');
  // Если клиент уже есть — обновляем привязку к auth_user_id, если её ещё нет.
  const existing = await findByBusinessAndEmail(businessId, e);
  if (existing) {
    if (opts.authUserId && !existing.auth_user_id) {
      await adminClient().from('customers').update({ auth_user_id: opts.authUserId }).eq('id', existing.id);
      return { ...existing, auth_user_id: opts.authUserId };
    }
    return existing;
  }
  const { data, error } = await adminClient()
    .from('customers')
    .insert({
      business_id: businessId,
      email: e,
      name: opts.name ?? null,
      phone: opts.phone ?? null,
      auth_user_id: opts.authUserId ?? null,
    })
    .select('*')
    .single<Customer>();
  if (error) throw new Error(`customers: ${error.message}`);
  return data!;
}

// Подписываемый JWT для сессии клиента. aud/role='authenticated', чтобы проходил проверку verifyAccessToken.
function signCustomerToken(customer: Pick<Customer, 'id' | 'email'>): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('Не задан SUPABASE_JWT_SECRET — подпись сессии клиента невозможна');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: customer.id,
    email: customer.email,
    aud: 'authenticated',
    role: 'authenticated',
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const enc = (o: unknown): string => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

// Начинает сессию клиента: пишет подписанный JWT в cookie customer_session (30 дней).
export function startCustomerSession(customer: Pick<Customer, 'id' | 'email'>): void {
  const jar = cookies();
  jar.set(CUSTOMER_COOKIE, signCustomerToken(customer), sessionCookieOptions(SESSION_TTL_SECONDS));
}

export async function endCustomerSession(): Promise<void> {
  const jar = cookies();
  jar.set(CUSTOMER_COOKIE, '', sessionCookieOptions(0));
}

// Читает сессию клиента для бизнеса. Возвращает клиента и email или null (в т.ч. при невалидном/чужом токене
// или отсутствии записи в этом бизнесе — тогда токен стирается).
export async function readCustomerSession(businessId: string): Promise<CustomerSession | null> {
  const jar = cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value ?? null;
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) {
    await endCustomerSession();
    return null;
  }
  const customer = await findByIdAndBusiness(claims.sub, businessId);
  if (!customer) {
    await endCustomerSession();
    return null;
  }
  return { customer, email: claims.email };
}
