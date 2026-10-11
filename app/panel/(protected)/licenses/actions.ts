'use server';
// app/panel/(protected)/licenses/actions.ts — лицензии: создание, блокировка, разрешённый домен, игнорирование сигнала (ТЗ §5.8).
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';

const UUID = /^[0-9a-f-]{36}$/i;
const DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;

export async function createLicense(formData: FormData) {
  const businessId = String(formData.get('business_id') ?? '');
  const domain = String(formData.get('domain') ?? '').trim().toLowerCase();
  if (!UUID.test(businessId) || !DOMAIN.test(domain)) return;
  const { data } = await adminClient()
    .from('licenses').insert({ business_id: businessId, domain, allowed_domains: [domain] }).select('license_id').single();
  await adminClient().from('businesses').update({ license_id: data?.license_id }).eq('id', businessId);
  await audit('license_create', 'business', businessId, { domain, license_id: data?.license_id });
  revalidatePath('/panel/licenses');
}

export async function setRevoked(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const revoked = formData.get('revoked') === '1';
  if (!UUID.test(id)) return;
  await adminClient().from('licenses').update({ revoked }).eq('id', id);
  await audit(revoked ? 'license_revoke' : 'license_restore', 'license', id, {});
  revalidatePath('/panel/licenses');
}

export async function allowDomain(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const domain = String(formData.get('domain') ?? '').trim().toLowerCase();
  if (!UUID.test(id) || !DOMAIN.test(domain)) return;
  const db = adminClient();
  const { data: lic } = await db.from('licenses').select('allowed_domains').eq('id', id).maybeSingle();
  if (!lic) return;
  const next = Array.from(new Set([...(lic.allowed_domains ?? []), domain]));
  await db.from('licenses').update({ allowed_domains: next }).eq('id', id);
  await audit('license_allow_domain', 'license', id, { domain });
  revalidatePath('/panel/licenses');
}

// Игнорировать: сигнал «unverified/unknown» по этой лицензии отмечен как просмотренный (в журнале, без блокировки).
export async function ignoreSignal(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  await audit('license_ignore', 'license', id, {});
  revalidatePath('/panel/licenses');
}
