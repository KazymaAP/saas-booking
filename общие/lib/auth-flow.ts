// lib/auth-flow.ts — общие шаги беспарольных сценариев (magic-link, сброс пароля): кто имеет право
// получить письмо, куда вернуть после входа и как открыть сессию в нужной области (ТЗ §5.2–5.5).
import { adminClient } from './supabase';
import { panelRootOf, sanitizePanelNext, type AuthRealm, type SignInResult } from './auth-core';
import { authEvent } from './auth-audit';
import type { ProviderSession } from './auth-provider';
import { isSuperAdminEmail } from './admin-session';
import { completeOwnerSignIn } from './owner-session';
import { startSession } from './auth-session';

// Стартовая страница супер-админки (как у входа по паролю).
export const ADMIN_HOME = '/admin';

const OWNER_PANEL_SLUG_RE = /^\/[a-z0-9-]+\/([a-z0-9-]+)\/panel(?:\/|$)/i;

// slug бизнеса из пути кабинета: /{prefix}/{slug}/panel/...
export function slugFromPanelPath(path: string | null): string | null {
  if (!path) return null;
  return OWNER_PANEL_SLUG_RE.exec(path)?.[1] ?? null;
}

// Куда вернуть после входа. Супер-админ — только внутрь /panel, владелец — только в /{prefix}/{slug}/panel.
// Для владельца null означает «кабинет не определён»: письмо не отправляется.
export function normalizeReturnTo(realm: AuthRealm, raw: string | null): string | null {
  const safe = sanitizePanelNext(raw);
  if (!safe) return realm === 'admin' ? ADMIN_HOME : null;
  const root = panelRootOf(safe.split(/[?#]/)[0] ?? '');
  if (realm === 'admin') return root === '/panel' ? safe : ADMIN_HOME;
  return root && root !== '/panel' ? safe : null;
}

// Страница входа той области, куда пользователь возвращается.
export function loginPathFor(realm: AuthRealm, returnTo: string | null): string {
  if (realm === 'owner' && returnTo) {
    const root = panelRootOf(returnTo.split(/[?#]/)[0] ?? '');
    if (root && root !== '/panel') return `${root}/login`;
  }
  return '/panel/login';
}

// Может ли адрес получить письмо для входа в область. Письма уходят только своим:
// супер-админу из SUPERADMIN_EMAILS или участнику активного бизнеса из returnTo.
export async function isEligible(email: string, realm: AuthRealm, returnTo: string | null): Promise<boolean> {
  if (realm === 'admin') return isSuperAdminEmail(email);
  const slug = slugFromPanelPath(returnTo);
  if (!slug) return false;
  const db = adminClient();
  const { data: business } = await db.from('businesses').select('id, status').eq('slug', slug)
    .maybeSingle<{ id: string; status: string }>();
  if (!business || business.status !== 'client') return false;
  const { data: member } = await db.from('admin_users').select('id').eq('business_id', business.id).eq('email', email)
    .maybeSingle<{ id: string }>();
  return member !== null;
}

// Открывает сессию области по уже полученной сессии провайдера. Права перепроверяются здесь же:
// между отправкой письма и переходом по ссылке адрес могли убрать из списка или из команды.
export async function startRealmSession(
  realm: AuthRealm, session: ProviderSession, returnTo: string | null, ip: string, method: string,
): Promise<SignInResult> {
  if (realm === 'admin') {
    if (!isSuperAdminEmail(session.user.email)) {
      await authEvent('login_failed', { realm, email: session.user.email, ip, reason: `${method}:not_superadmin` });
      return 'invalid';
    }
    startSession('admin', session);
    await authEvent('login_success', { realm, email: session.user.email, ip, reason: method });
    return 'ok';
  }
  const slug = slugFromPanelPath(returnTo);
  return slug ? completeOwnerSignIn(session, slug, ip) : 'invalid';
}
