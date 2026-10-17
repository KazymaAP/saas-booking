// tests/stand.ts — подготовка данных для e2e на тестовом стенде (E2E_STAND=1).
// Нужны: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY тестового проекта Supabase и применённые
// миграции auth_tokens/admin_invites (notes.md, запрос агенту 1). Почта не нужна: токен генерирует тест
// и кладёт в БД его дайджест — ровно так, как это делает lib/auth-tokens.ts.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expiresAt, generateToken, INVITE_TTL_SECONDS, RESET_TTL_SECONDS, MAGIC_LINK_TTL_SECONDS, tokenDigest } from '../lib/auth-core';

export const STAND = process.env.E2E_STAND === '1';
export const STAND_SKIP_REASON = 'нужен тестовый стенд: E2E_STAND=1 и ключи Supabase (notes.md → Блокеры)';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`e2e: не задана ${name}`);
  return value;
}

function db(): SupabaseClient {
  return createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

export type StandBusiness = { readonly id: string; readonly slug: string; readonly prefix: string; readonly panel: string };

// Бизнес-клиент с шаблоном ниши: кабинет доступен по /{prefix}/{slug}/panel.
export async function createBusiness(status: 'client' | 'lead' = 'client'): Promise<StandBusiness> {
  const client = db();
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const prefix = `e${suffix}`.slice(0, 12);
  const { data: tpl, error: tplError } = await client.from('vertical_templates')
    .insert({ name: 'E2E', slug: `e2e-${suffix}`, url_prefix: prefix }).select('id').single<{ id: string }>();
  if (tplError || !tpl) throw new Error(`e2e: шаблон не создан: ${tplError?.message ?? ''}`);
  const slug = `e2e-${suffix}`;
  const { data: biz, error } = await client.from('businesses')
    .insert({ name: 'E2E бизнес', slug, status, vertical_template_id: tpl.id }).select('id').single<{ id: string }>();
  if (error || !biz) throw new Error(`e2e: бизнес не создан: ${error?.message ?? ''}`);
  return { id: biz.id, slug, prefix, panel: `/${prefix}/${slug}/panel` };
}

export async function createUser(email: string, password: string): Promise<string> {
  const { data, error } = await db().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`e2e: пользователь не создан: ${error?.message ?? ''}`);
  return data.user.id;
}

export async function addMember(businessId: string, userId: string, email: string, role: 'owner' | 'manager'): Promise<void> {
  const { error } = await db().from('admin_users').insert({ business_id: businessId, auth_user_id: userId, email, role });
  if (error) throw new Error(`e2e: участник не добавлен: ${error.message}`);
}

export async function createInviteToken(businessId: string, email: string, role: 'owner' | 'manager', ttlSeconds = INVITE_TTL_SECONDS): Promise<string> {
  const token = generateToken();
  const { error } = await db().from('admin_invites').insert({
    business_id: businessId, email, role, token: tokenDigest(token), expires_at: expiresAt(new Date(), ttlSeconds).toISOString(),
  });
  if (error) throw new Error(`e2e: приглашение не создано: ${error.message}`);
  return token;
}

export type TokenKind = 'magic_link' | 'reset';

export async function createAuthToken(kind: TokenKind, email: string, realm: 'admin' | 'owner', returnTo: string | null, ttlSeconds?: number): Promise<string> {
  const token = generateToken();
  const ttl = ttlSeconds ?? (kind === 'reset' ? RESET_TTL_SECONDS : MAGIC_LINK_TTL_SECONDS);
  const { error } = await db().from('auth_tokens').insert({
    kind, token_digest: tokenDigest(token), email, realm, return_to: returnTo, expires_at: expiresAt(new Date(), ttl).toISOString(),
  });
  if (error) throw new Error(`e2e: токен не создан: ${error.message}`);
  return token;
}

// Сброс лимитов между тестами, иначе серия тестов с одного IP упрётся в rate limit.
export async function clearAuthRateLimits(): Promise<void> {
  await db().from('rate_limits').delete().like('bucket', 'auth:%');
}
