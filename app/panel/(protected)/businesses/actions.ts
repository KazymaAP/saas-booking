'use server';
// app/panel/(protected)/businesses/actions.ts — ручное добавление и массовые операции (ТЗ §5.4).
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { slugify } from '@/lib/slug';
import { normalizePhone } from '@/lib/phone';
import { audit } from '@/lib/audit';

export async function addBusiness(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2) return;
  const db = adminClient();

  let slug = slugify(name);
  let n = 2;
  while ((await db.from('businesses').select('id').eq('slug', slug).maybeSingle()).data) slug = `${slugify(name)}-${n++}`;

  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const { data, error } = await db.from('businesses').insert({
    name,
    slug,
    city: String(formData.get('city') ?? '').trim() || null,
    address: String(formData.get('address') ?? '').trim() || null,
    phones: phone ? [phone] : [],
    emails: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? [email] : [],
    status: email ? 'new' : 'no_contact',
  }).select('id').single();
  if (error || !data) return;

  await audit('business_add', 'business', data.id, { name });
  revalidatePath('/panel/businesses');
}

// Массовая смена статуса выбранных бизнесов. Статусы клиента (client) сюда не допускаются: оплата идёт через /panel/clients.
const MASS_STATUSES = ['new', 'in_progress', 'preview_ready', 'approved', 'refused', 'no_contact', 'archived'] as const;

export async function massSetStatus(formData: FormData) {
  const status = String(formData.get('status') ?? '');
  const ids = formData.getAll('ids').map(String).filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  if (!(MASS_STATUSES as readonly string[]).includes(status) || ids.length === 0) return;
  const patch: Record<string, unknown> = { status };
  if (status === 'refused') patch.refused_at = new Date().toISOString(); // для архивации через 30 дней (§25)
  await adminClient().from('businesses').update(patch).in('id', ids).neq('status', 'client');
  await audit('mass_status', 'business', null, { status, count: ids.length });
  revalidatePath('/panel/businesses');
}
