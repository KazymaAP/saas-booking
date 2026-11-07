'use server';
// app/panel/(protected)/businesses/[id]/actions.ts — действия карточки бизнеса (ТЗ §13.3).
// Права — guarded() в каждом действии, вход — zod, изменения — audit (без ПД), ошибки — logError.
import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { errorMessage, logError } from '@/lib/log';
import { SITE_URL } from '@/lib/site';
import { fail, guarded, ok, type ActionResult } from '@/главная/lib/action';
import { cardStatusSchema, domainSchema, idSchema, notesSchema, slugSchema } from './schema';

type Result = ActionResult<null>;
type Prev = Result | null;

const DAY_MS = 86_400_000;
// ТЗ §3.6: pending_deletion держится 30 дней, затем cron удаляет запись.
const DELETION_DELAY_DAYS = 30;
const VERCEL_TIMEOUT_MS = 8000;

const cardPath = (id: string) => `/panel/businesses/${id}`;

function done(id: string, message: string): Result {
  revalidatePath(cardPath(id));
  return ok(message, null);
}

function readId(formData: FormData): string | null {
  const parsed = idSchema.safeParse(formData.get('id'));
  return parsed.success ? parsed.data : null;
}

export async function saveNotes(_p: Prev, formData: FormData): Promise<Result> {
  return await guarded('card.notes', async () => {
    const id = readId(formData);
    const notes = notesSchema.safeParse(String(formData.get('notes') ?? ''));
    if (!id) return fail('Бизнес не найден');
    if (!notes.success) return fail('Заметка слишком длинная', { notes: notes.error.issues[0]?.message ?? 'Слишком длинно' });
    const { error } = await adminClient().from('businesses').update({ notes: notes.data }).eq('id', id);
    if (error) throw new Error(error.message);
    // Текст заметки может содержать ПД — в журнал пишем только длину.
    await audit('notes_save', 'business', id, { length: notes.data.length });
    return done(id, 'Заметка сохранена');
  });
}

type VercelEnv = { token: string; project: string; team: string };

function vercelEnv(): VercelEnv | null {
  const token = process.env.VERCEL_API_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project) return null;
  return { token, project, team: process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '' };
}

// Регистрация домена в Vercel. Ошибка не отменяет сохранение: домен можно добавить вручную, она уходит в журнал.
async function registerDomain(domain: string): Promise<boolean> {
  const env = vercelEnv();
  if (!env) return false;
  const res = await fetch(`https://api.vercel.com/v10/projects/${env.project}/domains${env.team}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: domain }),
    signal: AbortSignal.timeout(VERCEL_TIMEOUT_MS),
  }).catch((e: unknown) => {
    void logError('vercel', errorMessage(e), { domain });
    return null;
  });
  if (res && !res.ok && res.status !== 409) await logError('vercel', `domain add: HTTP ${res.status}`, { domain });
  return Boolean(res?.ok);
}

export async function saveDomain(_p: Prev, formData: FormData): Promise<Result> {
  return await guarded('card.domain', async () => {
    const id = readId(formData);
    if (!id) return fail('Бизнес не найден');
    const parsed = domainSchema.safeParse(String(formData.get('domain') ?? ''));
    if (!parsed.success) return fail('Проверьте домен', { domain: parsed.error.issues[0]?.message ?? 'Неверный домен' });
    const domain = parsed.data || null;
    const { error } = await adminClient().from('businesses').update({ custom_domain: domain, ssl_status: 'pending' }).eq('id', id);
    // 23505 — домен уже привязан к другому бизнесу (unique custom_domain).
    if (error?.code === '23505') return fail('Домен уже привязан к другому бизнесу', { domain: 'Этот домен уже занят' });
    if (error) throw new Error(error.message);
    const registered = domain ? await registerDomain(domain) : false;
    await audit('domain_set', 'business', id, { domain, registered });
    if (domain && !vercelEnv()) return done(id, 'Домен сохранён. VERCEL_API_TOKEN не задан — добавьте домен в Vercel вручную.');
    return done(id, domain ? 'Домен сохранён. Проверьте SSL через 10–60 минут.' : 'Домен отвязан');
  });
}

type SslStatus = 'pending' | 'active' | 'error';

async function fetchSsl(domain: string): Promise<SslStatus> {
  const env = vercelEnv();
  if (!env) return 'pending';
  const res = await fetch(`https://api.vercel.com/v9/projects/${env.project}/domains/${encodeURIComponent(domain)}${env.team}`, {
    headers: { Authorization: `Bearer ${env.token}` },
    signal: AbortSignal.timeout(VERCEL_TIMEOUT_MS),
  }).catch(() => null);
  if (!res) return 'pending';
  if (!res.ok) return 'error';
  const j = (await res.json().catch(() => null)) as { verified?: boolean } | null;
  return j?.verified ? 'active' : 'pending';
}

// ТЗ §13.3: SSL-статус кастомного домена — pending | active | error.
export async function checkSsl(_p: Prev, formData: FormData): Promise<Result> {
  return await guarded('card.ssl', async () => {
    const id = readId(formData);
    if (!id) return fail('Бизнес не найден');
    const db = adminClient();
    const { data: b, error: readError } = await db.from('businesses').select('custom_domain').eq('id', id).maybeSingle<{ custom_domain: string | null }>();
    // Сбой чтения — не «домена нет»: уходит в guarded → журнал + общий тост.
    if (readError) throw new Error(readError.message);
    if (!b) return fail('Бизнес не найден');
    if (!b.custom_domain) return fail('Сначала укажите домен');
    const status = await fetchSsl(b.custom_domain);
    const { error } = await db.from('businesses').update({ ssl_status: status }).eq('id', id);
    if (error) throw new Error(error.message);
    await audit('ssl_check', 'business', id, { domain: b.custom_domain, status });
    const text: Record<SslStatus, string> = { active: 'SSL активен', pending: 'SSL ещё не выпущен — DNS не обновился', error: 'Ошибка: домен не найден в Vercel' };
    return done(id, text[status]);
  });
}

type SlugRow = { id: string; slug: string; slug_history: string[] | null; preview_token: string | null };

// Смена slug: старый уходит в slug_history (middleware/страницы делают 301 со старого адреса, ТЗ §3.4).
export async function changeSlug(_p: Prev, formData: FormData): Promise<Result> {
  return await guarded('card.slug', async () => {
    const id = readId(formData);
    if (!id) return fail('Бизнес не найден');
    const parsed = slugSchema.safeParse(String(formData.get('slug') ?? ''));
    if (!parsed.success) return fail('Проверьте адрес', { slug: parsed.error.issues[0]?.message ?? 'Неверный адрес' });
    const slug = parsed.data;
    const db = adminClient();
    // Один запрос: сама запись + все, кто занимает slug сейчас или занимал раньше.
    const { data, error } = await db
      .from('businesses').select('id, slug, slug_history, preview_token')
      .or(`id.eq.${id},slug.eq.${slug},slug_history.cs.{${slug}}`)
      .returns<SlugRow[]>();
    if (error) throw new Error(error.message);
    const self = (data ?? []).find((r) => r.id === id);
    if (!self) return fail('Бизнес не найден');
    if (self.slug === slug) return fail('Адрес не изменился', { slug: 'Это текущий адрес' });
    if ((data ?? []).some((r) => r.id !== id)) return fail('Адрес занят', { slug: 'Этот адрес уже используется или использовался' });
    const history = [...new Set([...(self.slug_history ?? []), self.slug])].filter((s) => s !== slug);
    const patch: Record<string, unknown> = { slug, slug_history: history };
    if (self.preview_token) patch.preview_url = `${SITE_URL}/preview/${slug}?token=${self.preview_token}`;
    const upd = await db.from('businesses').update(patch).eq('id', id);
    if (upd.error?.code === '23505') return fail('Адрес занят', { slug: 'Этот адрес уже используется' });
    if (upd.error) throw new Error(upd.error.message);
    await audit('slug_change', 'business', id, { from: self.slug, to: slug });
    return done(id, `Адрес изменён: ${slug}. Старый перенаправляет на новый.`);
  });
}

// Смена статуса из карточки (optimistic на клиенте). Клиентов не трогаем: оплата и отключение — в /panel/clients.
export async function changeStatus(id: string, status: string): Promise<Result> {
  return await guarded('card.status', async () => {
    const pid = idSchema.safeParse(id);
    const ps = cardStatusSchema.safeParse(status);
    if (!pid.success || !ps.success) return fail('Выберите статус из списка');
    const patch: Record<string, unknown> = { status: ps.data };
    if (ps.data === 'refused') patch.refused_at = new Date().toISOString();
    const { data, error } = await adminClient()
      .from('businesses').update(patch).eq('id', pid.data)
      .not('status', 'in', '(client,transferred_out,pending_deletion,deleted)')
      .select('id').returns<{ id: string }[]>();
    if (error) throw new Error(error.message);
    if (!data?.length) return fail('Статус этого бизнеса меняется только в разделе «Клиенты»');
    await audit('status_change', 'business', pid.data, { to: ps.data });
    return done(pid.data, 'Статус изменён');
  });
}

// Кнопки карточки (ТЗ §13.3): одобрить, отправить, архивировать, удалить. Каждая — условный UPDATE (идемпотентно).
type CardOp = 'approve' | 'send' | 'archive' | 'delete';

async function conditional(id: string, patch: Record<string, unknown>, onlyFrom: string[] | null, exclude: string[]): Promise<boolean> {
  let q = adminClient().from('businesses').update(patch).eq('id', id);
  if (onlyFrom) q = q.in('status', onlyFrom);
  if (exclude.length) q = q.not('status', 'in', `(${exclude.join(',')})`);
  const { data, error } = await q.select('id').returns<{ id: string }[]>();
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

// «Отправить»: одна запись в очередь outreach_log (cron шлёт письмо). Повторно не ставим.
async function queueOne(id: string): Promise<Result> {
  const db = adminClient();
  const { data: b, error: readError } = await db.from('businesses').select('status, emails').eq('id', id).maybeSingle<{ status: string; emails: string[] | null }>();
  if (readError) throw new Error(readError.message);
  if (!b) return fail('Бизнес не найден');
  if (b.status !== 'approved') return fail('Отправить можно только одобренный прототип');
  if (!b.emails?.length) return fail('У бизнеса нет email');
  // Ошибку подсчёта не глотаем: count=null при сбое выглядел бы как «писем нет» → повторное письмо бизнесу.
  const { count, error: countError } = await db.from('outreach_log').select('id', { count: 'exact', head: true }).eq('business_id', id);
  if (countError) throw new Error(countError.message);
  if (count) return fail('Письмо уже в очереди или отправлено');
  const { error } = await db.from('outreach_log').insert({ business_id: id, channel: 'email', template_id: 'default', status: 'queued', tracking_token: randomBytes(16).toString('hex') });
  if (error) throw new Error(error.message);
  await audit('card_queue', 'business', id, {});
  return done(id, 'Письмо поставлено в очередь');
}

const PROTECTED = ['client', 'transferred_out', 'deleted'];

export async function cardAction(id: string, op: CardOp): Promise<Result> {
  return await guarded(`card.${op}`, async () => {
    const pid = idSchema.safeParse(id);
    if (!pid.success) return fail('Бизнес не найден');
    const bid = pid.data;
    if (op === 'send') return await queueOne(bid);
    if (op === 'approve') {
      if (!(await conditional(bid, { status: 'approved' }, ['preview_ready'], []))) return fail('Одобрить можно только готовый прототип');
      await audit('card_approve', 'business', bid, { to: 'approved' });
      return done(bid, 'Прототип одобрен');
    }
    if (op === 'archive') {
      if (!(await conditional(bid, { status: 'archived' }, null, [...PROTECTED, 'archived', 'pending_deletion']))) return fail('Этот бизнес нельзя архивировать');
      await audit('card_archive', 'business', bid, { to: 'archived' });
      return done(bid, 'Бизнес в архиве');
    }
    const when = new Date(Date.now() + DELETION_DELAY_DAYS * DAY_MS).toISOString();
    if (!(await conditional(bid, { status: 'pending_deletion', deletion_scheduled_at: when }, null, [...PROTECTED, 'pending_deletion']))) return fail('Этот бизнес нельзя удалить');
    await audit('card_delete', 'business', bid, { to: 'pending_deletion', scheduled: when });
    return done(bid, `Бизнес будет удалён ${new Date(when).toLocaleDateString('ru-RU')}`);
  });
}
