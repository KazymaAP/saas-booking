'use server';
// app/panel/(protected)/licenses/actions.ts — лицензии: выдача, блокировка, разрешённый домен, игнор сигнала (ТЗ 4.0 §14.6).
// Каждый action сам проверяет isSuperAdmin: layout защищает страницу, но НЕ защищает прямой вызов server action.
// Возвращают ActionResult — клиентская таблица показывает результат и откатывает optimistic-состояние при ошибке.
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { isSuperAdmin } from '@/lib/admin-session';
import { normalizeDomain } from '@/lib/license-client';
import { DOMAIN_RE, UUID_RE, allowLicenseDomain, setLicenseRevoked } from '@/lib/license-server';

export type ActionResult = { ok: boolean; message: string };

const PATH = '/panel/licenses';
const DENIED: ActionResult = { ok: false, message: 'Нет доступа' };
const BAD_INPUT: ActionResult = { ok: false, message: 'Проверьте данные' };
const DB_FAIL: ActionResult = { ok: false, message: 'Ошибка базы данных, попробуйте ещё раз' };
const NOT_FOUND: ActionResult = { ok: false, message: 'Лицензия не найдена' };

function field(fd: FormData, name: string): string {
  return String(fd.get(name) ?? '').trim();
}

function domainField(fd: FormData): string {
  return normalizeDomain(field(fd, 'domain'));
}

export async function createLicense(formData: FormData): Promise<ActionResult> {
  if (!(await isSuperAdmin())) return DENIED;
  const businessId = field(formData, 'business_id');
  const domain = domainField(formData);
  if (!UUID_RE.test(businessId) || !DOMAIN_RE.test(domain)) return BAD_INPUT;
  const db = adminClient();
  // Идемпотентность: у бизнеса уже есть лицензия → не плодим вторую.
  const { data: existing } = await db.from('licenses').select('license_id').eq('business_id', businessId).limit(1);
  if (existing && existing.length > 0) return { ok: false, message: 'У этого бизнеса уже есть лицензия' };
  const { data, error } = await db
    .from('licenses').insert({ business_id: businessId, domain, allowed_domains: [domain] }).select('license_id').single();
  if (error || !data) return DB_FAIL;
  await db.from('businesses').update({ license_id: data.license_id }).eq('id', businessId);
  await audit('license_create', 'business', businessId, { domain, license_id: data.license_id });
  revalidatePath(PATH);
  return { ok: true, message: 'Лицензия выдана' };
}

export async function setRevoked(formData: FormData): Promise<ActionResult> {
  if (!(await isSuperAdmin())) return DENIED;
  const id = field(formData, 'id');
  const revoked = field(formData, 'revoked') === '1';
  if (!UUID_RE.test(id)) return BAD_INPUT;
  const r = await setLicenseRevoked({ by: 'id', value: id }, revoked);
  if (!r.ok) return r.reason === 'not_found' ? NOT_FOUND : DB_FAIL;
  if (r.changed) await audit(revoked ? 'license_revoke' : 'license_restore', 'license', id, { via: 'panel' });
  revalidatePath(PATH);
  return { ok: true, message: revoked ? 'Лицензия заблокирована' : 'Лицензия разблокирована' };
}

export async function allowDomain(formData: FormData): Promise<ActionResult> {
  if (!(await isSuperAdmin())) return DENIED;
  const id = field(formData, 'id');
  const domain = domainField(formData);
  if (!UUID_RE.test(id) || !DOMAIN_RE.test(domain)) return BAD_INPUT;
  const r = await allowLicenseDomain(id, domain);
  if (!r.ok) return r.reason === 'not_found' ? NOT_FOUND : DB_FAIL;
  if (r.changed) await audit('license_allow_domain', 'license', id, { domain });
  revalidatePath(PATH);
  return { ok: true, message: r.changed ? `Домен ${domain} разрешён` : 'Домен уже был разрешён' };
}

// Игнорировать: сигнал unverified/unknown отмечен как просмотренный. Блокировки нет — только запись в журнал.
// Страница скрывает сигналы, которые старше последнего license_ignore по этой лицензии.
// Идемпотентно: повтор в течение IGNORE_DEDUP_MS (двойной клик, две вкладки) не плодит записи в audit_log.
const IGNORE_DEDUP_MS = 60_000;

export async function ignoreSignal(formData: FormData): Promise<ActionResult> {
  if (!(await isSuperAdmin())) return DENIED;
  const id = field(formData, 'id');
  if (!UUID_RE.test(id)) return BAD_INPUT;
  const since = new Date(Date.now() - IGNORE_DEDUP_MS).toISOString();
  const { data: recent } = await adminClient()
    .from('audit_log').select('id').eq('action', 'license_ignore').eq('entity_id', id).gte('created_at', since).limit(1);
  if (recent && recent.length > 0) return { ok: true, message: 'Сигнал скрыт' };
  await audit('license_ignore', 'license', id, {});
  revalidatePath(PATH);
  return { ok: true, message: 'Сигнал скрыт' };
}
