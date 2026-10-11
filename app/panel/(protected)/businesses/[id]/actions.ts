'use server';
// app/panel/(protected)/businesses/[id]/actions.ts — заметки, кастомный домен, проверка SSL (ТЗ §5.4, §50–52).
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { logError } from '@/lib/log';

const UUID = /^[0-9a-f-]{36}$/i;
const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/;

export async function saveNotes(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  await adminClient().from('businesses').update({ notes: String(formData.get('notes') ?? '').slice(0, 5000) }).eq('id', id);
  revalidatePath(`/panel/businesses/${id}`);
}

export async function saveDomain(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const domain = String(formData.get('domain') ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!UUID.test(id)) return;
  if (domain && !DOMAIN.test(domain)) return;
  const db = adminClient();
  await db.from('businesses').update({ custom_domain: domain || null, ssl_status: 'pending' }).eq('id', id);
  if (domain) {
    const token = process.env.VERCEL_API_TOKEN;
    const project = process.env.VERCEL_PROJECT_ID;
    const team = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : '';
    if (token && project) {
      await fetch(`https://api.vercel.com/v10/projects/${project}/domains${team}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: domain }),
      }).catch((e) => logError('vercel', (e as Error).message, { domain }));
    }
  }
  await audit('domain_set', 'business', id, { domain });
  revalidatePath(`/panel/businesses/${id}`);
}

// §51: кнопка «Проверить SSL» — статус pending | active | error по данным Vercel.
export async function checkSsl(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  const db = adminClient();
  const { data: b } = await db.from('businesses').select('custom_domain').eq('id', id).maybeSingle();
  if (!b?.custom_domain) return;
  const token = process.env.VERCEL_API_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : '';
  let status: 'pending' | 'active' | 'error' = 'pending';
  if (token && project) {
    const res = await fetch(`https://api.vercel.com/v9/projects/${project}/domains/${b.custom_domain}${team}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { verified?: boolean; error?: unknown } | null;
    if (res?.ok && j?.verified) status = 'active';
    else if (res && !res.ok) status = 'error';
  }
  await db.from('businesses').update({ ssl_status: status }).eq('id', id);
  revalidatePath(`/panel/businesses/${id}`);
}
