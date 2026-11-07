'use server';

// app/auth/actions.ts — единая авторизация: регистрация (партнёр/предприниматель), вход,
// сброс пароля по 6-значному коду (Supabase Auth OTP; SMTP проекта не требуется).
import { createPartner, authenticatePartner } from '@/lib/partners';
import { createPartnerSession, writePartnerSessionCookie, hashPassword } from '@/lib/partners-auth';
import { isSuperAdminEmail } from '@/lib/admin-session';
import { startSession } from '@/lib/auth-session';
import { passwordSignIn, setUserPassword } from '@/lib/auth-provider';
import { adminClient, publicClient } from '@/lib/supabase';
import { allowAll } from '@/lib/auth-rate';
import { requestContext } from '@/lib/auth-request';
import { createEntrepreneurRequest } from '@/lib/entrepreneur';

export type AuthActionResult =
  | { ok: true; message?: string; redirect?: string }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function allowAttempt(email: string): Promise<AuthActionResult | null> {
  const ctx = requestContext();
  if (!ctx.sameOrigin) return { ok: false, error: 'Запрос отклонён' };
  const allowed = await allowAll([['login_ip', ctx.ip], ['login_email', email]]);
  if (!allowed) return { ok: false, error: 'Слишком много попыток. Попробуйте позже.' };
  return null;
}

async function findPartner(email: string): Promise<{ id: string; email: string } | null> {
  const { data } = await adminClient().from('partners').select('id, email').eq('email', email).maybeSingle();
  return (data as { id: string; email: string } | null) ?? null;
}

async function findAuthUser(email: string): Promise<{ id: string; email?: string } | null> {
  try {
    const { data } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
    return (data.users ?? []).find((user) => user.email?.toLowerCase() === email) ?? null;
  } catch {
    return null;
  }
}

export async function registerAction(input: {
  role: 'entrepreneur' | 'partner';
  name: string;
  email: string;
  password: string;
  /** Код пригласившего партнёра (второй уровень программы). */
  referrerCode?: string | null;
}): Promise<AuthActionResult> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const password = input.password;

  if (name.length < 2) return { ok: false, error: 'Укажите имя' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Некорректная почта' };
  if (password.length < 8) return { ok: false, error: 'Пароль должен быть не короче 8 символов' };

  const denied = await allowAttempt(email);
  if (denied) return denied;

  if (input.role === 'partner') {
    try {
      await createPartner({ email, name, password, referrerCode: input.referrerCode ?? null });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Не удалось зарегистрироваться' };
    }
    const partner = await authenticatePartner(email, password);
    if (!partner) return { ok: false, error: 'Аккаунт создан, но вход не удался. Попробуйте войти.' };
    writePartnerSessionCookie(createPartnerSession(partner.id));
    return { ok: true, redirect: '/partner' };
  }

  // Предприниматель: заявка (businesses, status=new) + аккаунт Supabase Auth.
  try {
    await createEntrepreneurRequest({ name, email });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Не удалось создать заявку' };
  }
  const { error } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    const exists = /already|exists|registered/i.test(error.message);
    return {
      ok: true,
      message: exists
        ? 'Заявка отправлена. Аккаунт с этой почтой уже есть — войдите.'
        : 'Заявка отправлена. Аккаунт создадим вручную — мы свяжемся с вами.',
    };
  }
  return { ok: true, message: 'Аккаунт создан, заявка отправлена. Мы свяжемся с вами и активируем сайт.' };
}

export async function loginAction(emailRaw: string, password: string): Promise<AuthActionResult> {
  const email = normalizeEmail(emailRaw);
  if (!EMAIL_RE.test(email) || password.length === 0) return { ok: false, error: 'Введите почту и пароль' };

  const denied = await allowAttempt(email);
  if (denied) return denied;

  // 1) Партнёр (своя таблица partners + cookie).
  const partner = await authenticatePartner(email, password);
  if (partner) {
    writePartnerSessionCookie(createPartnerSession(partner.id));
    return { ok: true, redirect: '/partner' };
  }

  // 2) Supabase Auth: супер-админ или владелец бизнеса.
  const session = await passwordSignIn(email, password);
  if (!session) return { ok: false, error: 'Неверный email или пароль' };

  if (isSuperAdminEmail(email)) {
    startSession('admin', session);
    return { ok: true, redirect: '/admin' };
  }

  const { data: member } = await adminClient()
    .from('admin_users')
    .select('business_id')
    .eq('auth_user_id', session.user.id)
    .limit(1)
    .maybeSingle();
  if (!member?.business_id) {
    return { ok: false, error: 'Аккаунт есть, но заявка ещё не обработана. Мы свяжемся с вами.' };
  }

  const { data: business } = await adminClient()
    .from('businesses')
    .select('slug, status, vertical_template_id')
    .eq('id', member.business_id)
    .maybeSingle();
  if (!business || business.status !== 'client') {
    return { ok: false, error: 'Кабинет недоступен: сайт ещё не активирован.' };
  }

  let prefix = 'd';
  if (business.vertical_template_id) {
    const { data: template } = await adminClient()
      .from('vertical_templates')
      .select('url_prefix')
      .eq('id', business.vertical_template_id)
      .maybeSingle();
    if (template?.url_prefix) prefix = template.url_prefix;
  }

  startSession('owner', session);
  return { ok: true, redirect: `/${prefix}/${business.slug}/panel` };
}

export async function requestCodeAction(emailRaw: string): Promise<AuthActionResult> {
  const email = normalizeEmail(emailRaw);
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Некорректная почта' };

  const denied = await allowAttempt(email);
  if (denied) return denied;

  const partner = await findPartner(email);
  const authUser = await findAuthUser(email);
  // Не раскрываем, есть ли аккаунт: отвечаем одинаково.
  if (!partner && !authUser) {
    return { ok: true, message: 'Если аккаунт с такой почтой есть, код отправлен. Проверьте почту.' };
  }

  const { error } = await publicClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) {
    return {
      ok: false,
      error: process.env.NODE_ENV !== 'production'
        ? `Не удалось отправить код: ${error.message}`
        : 'Не удалось отправить код. Попробуйте позже.',
    };
  }
  return { ok: true, message: 'Код отправлен на почту. Он действует 10 минут.' };
}

export async function resetPasswordAction(emailRaw: string, code: string, password: string): Promise<AuthActionResult> {
  const email = normalizeEmail(emailRaw);
  const token = code.trim();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Некорректная почта' };
  if (!/^\d{6}$/.test(token)) return { ok: false, error: 'Код — 6 цифр' };
  if (password.length < 8) return { ok: false, error: 'Пароль должен быть не короче 8 символов' };

  const denied = await allowAttempt(email);
  if (denied) return denied;

  const { data, error } = await publicClient().auth.verifyOtp({ email, token, type: 'email' });
  if (error || !data.session || !data.user) {
    return { ok: false, error: 'Неверный или истёкший код' };
  }

  const partner = await findPartner(email);
  if (partner) {
    const { error: updateError } = await adminClient()
      .from('partners')
      .update({ password_hash: hashPassword(password), updated_at: new Date().toISOString() })
      .eq('id', partner.id);
    if (updateError) return { ok: false, error: 'Не удалось обновить пароль' };
  } else {
    const updated = await setUserPassword(data.user.id, password);
    if (!updated) return { ok: false, error: 'Не удалось обновить пароль' };
  }

  return { ok: true, message: 'Пароль изменён. Войдите с новым паролем.' };
}
