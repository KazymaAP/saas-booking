// app/[prefix]/[slug]/my/actions.ts — server actions кабинета клиента /my (NEW-5, 2026-11-12).
// Каждый action сам проверяет: CSRF (sameOrigin), rate limit, zod, принадлежность к бизнесу.
// Кабинет работает всегда: без сессии /my показывает приглашение войти, с сессией — записи клиента.
'use server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { requestContext } from '@/lib/auth-request';
import { allowAll } from '@/lib/auth-rate';
import { authEvent } from '@/lib/auth-audit';
import { normalizeEmail } from '@/lib/auth-core';
import { passwordSignIn, signInWithOtp, verifyEmailOtp } from '@/lib/auth-provider';
import {
  CUSTOMER_REALM,
  createCustomer,
  endCustomerSession,
  findCustomerByEmail,
  startCustomerSession,
} from '@/lib/customer-session';

export type CustomerActionResult = { ok: true; message?: string } | { ok: false; error: string; reason?: string };

const CodeRequest = z.object({
  prefix: z.string().regex(/^[a-z0-9]+$/, 'Некорректный адрес'),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Некорректный адрес'),
  email: z.string().email('Некорректный email'),
});
const CodeVerify = CodeRequest.extend({ code: z.string().regex(/^\d{6}$/, 'Код — 6 цифр') });
const PasswordLogin = CodeRequest.extend({ password: z.string().min(1, 'Введите пароль') });

async function resolveBusinessId(slug: string): Promise<string | null> {
  const { data } = await adminClient().from('businesses').select('id').eq('slug', slug).maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

function csrfError(): CustomerActionResult {
  return { ok: false, error: 'Запрос отклонён. Обновите страницу и попробуйте снова.', reason: 'forbidden' };
}

// Запрос OTP-кода на email. Анти-перечисление: несуществующему клиенту код не шлём, но отвечаем нейтрально.
export async function requestCustomerCodeAction(input: unknown): Promise<CustomerActionResult> {
  if (!requestContext().sameOrigin) return csrfError();
  const parsed = CodeRequest.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Проверьте email' };
  const email = normalizeEmail(parsed.data.email);
  if (!email) return { ok: false, error: 'Проверьте email' };

  const ip = requestContext().ip;
  const allowed = await allowAll([['login_email', email], ['login_ip', ip]]);
  if (!allowed) return { ok: false, error: 'Слишком много попыток. Попробуйте позже.', reason: 'rate_limited' };

  const businessId = await resolveBusinessId(parsed.data.slug);
  if (!businessId) return { ok: false, error: 'Не удалось отправить код. Попробуйте позже.' };

  const existing = await findCustomerByEmail(businessId, email);
  if (existing) {
    // Supabase Auth создаст auth-пользователя (если ещё нет) и отправит 6-значный код на email.
    await signInWithOtp(email);
    await authEvent('magic_link_requested', { realm: CUSTOMER_REALM, email, ip, businessId });
  }
  return { ok: true, message: 'Если аккаунт существует, код отправлен на email' };
}

// Проверка OTP-кода и вход. Клиент бизнеса A не проходит проверку в бизнесе B — нейтральная ошибка (изоляция).
export async function verifyCustomerCodeAction(input: unknown): Promise<CustomerActionResult> {
  if (!requestContext().sameOrigin) return csrfError();
  const parsed = CodeVerify.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Проверьте код' };
  const email = normalizeEmail(parsed.data.email);
  if (!email) return { ok: false, error: 'Проверьте email' };

  const ip = requestContext().ip;
  const allowed = await allowAll([['token_verify', `${email}:${ip}`]]);
  if (!allowed) return { ok: false, error: 'Слишком много попыток. Попробуйте позже.', reason: 'rate_limited' };

  const businessId = await resolveBusinessId(parsed.data.slug);
  if (!businessId) return { ok: false, error: 'Сессия устарела. Попробуйте снова.' };

  const session = await verifyEmailOtp(email, parsed.data.code);
  if (!session) return { ok: false, error: 'Неверный код' };

  const customer = await findCustomerByEmail(businessId, email);
  if (!customer) {
    // Изоляция: клиент бизнеса A не становится клиентом бизнеса B через OTP.
    await authEvent('login_failed', { realm: CUSTOMER_REALM, email, ip, businessId, reason: 'not_customer_of_business' });
    return { ok: false, error: 'Нет аккаунта с таким email' };
  }
  // Первый OTP-вход: проставляем привязку к auth_user (idempotent).
  await createCustomer(businessId, email, { authUserId: session.user.id });
  startCustomerSession(customer);
  await authEvent('login_success', { realm: CUSTOMER_REALM, email, ip, businessId });
  return { ok: true, message: 'Вход выполнен' };
}

// Вход по email+паролю. Тоже с проверкой принадлежности клиента этому бизнесу (изоляция A≠B).
export async function customerPasswordLoginAction(input: unknown): Promise<CustomerActionResult> {
  if (!requestContext().sameOrigin) return csrfError();
  const parsed = PasswordLogin.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Проверьте email и пароль' };
  const email = normalizeEmail(parsed.data.email);
  if (!email) return { ok: false, error: 'Проверьте email' };

  const ip = requestContext().ip;
  const allowed = await allowAll([['login_email', email], ['login_ip', ip]]);
  if (!allowed) return { ok: false, error: 'Слишком много попыток. Попробуйте позже.', reason: 'rate_limited' };

  const businessId = await resolveBusinessId(parsed.data.slug);
  if (!businessId) return { ok: false, error: 'Не удалось войти. Попробуйте позже.' };

  const session = await passwordSignIn(email, parsed.data.password);
  if (!session) return { ok: false, error: 'Неверный email или пароль' };

  const customer = await findCustomerByEmail(businessId, email);
  if (!customer) {
    await authEvent('login_failed', { realm: CUSTOMER_REALM, email, ip, businessId, reason: 'not_customer_of_business' });
    return { ok: false, error: 'Нет аккаунта с таким email' };
  }
  await createCustomer(businessId, email, { authUserId: session.user.id });
  startCustomerSession(customer);
  await authEvent('login_success', { realm: CUSTOMER_REALM, email, ip, businessId });
  return { ok: true, message: 'Вход выполнен' };
}

export async function customerLogoutAction(): Promise<CustomerActionResult> {
  if (!requestContext().sameOrigin) return csrfError();
  await endCustomerSession();
  return { ok: true, message: 'Вы вышли из кабинета' };
}
