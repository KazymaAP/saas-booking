'use server';

// app/admin/data-actions.ts — чтение реальных данных для разделов супер-админки.
// Все действия защищены проверкой супер-админа: server actions — отдельные POST-эндпоинты.
// Ошибка запроса не роняет интерфейс: возвращаем пустой список и флаг ok=false.
import { adminClient } from '@/lib/supabase';
import { requireSuperAdminAction } from '@/lib/admin-session';
import { audit } from '@/lib/audit';
import { listPartnerAccounts } from '@/lib/ready-services';
import { auditActionLabel } from './audit-labels';

const DAY_MS = 86_400_000;

// ---------- дашборд ----------

export type DashboardData = {
  ok: boolean;
  businesses: { total: number; clients: number; moderation: number; suspended: number };
  bookings: { today: number; week: number; pending: number };
  money: { monthRevenue: number; paidCount: number; partnersBalance: number };
  partners: { total: number; leads: number };
  recent: { id: string; action: string; label: string; entity: string; created_at: string }[];
  /** Ошибки фоновых задач за сутки: иначе журнал тонет в повторах и проблема остаётся незамеченной. */
  cron: { errors24h: number; lastMessage: string; lastAt: string; lastSource: string };
};

/** Текст последней ошибки из payload журнала: без стека и лишних деталей, максимум 200 символов. */
function readErrorMessage(row: unknown): string {
  const payload = (row as { payload?: { message?: unknown } } | undefined)?.payload;
  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  return message.length > 200 ? `${message.slice(0, 197)}…` : message;
}

function dayStart(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export async function getDashboardDataAction(): Promise<DashboardData> {
  const empty: DashboardData = {
    ok: false,
    businesses: { total: 0, clients: 0, moderation: 0, suspended: 0 },
    bookings: { today: 0, week: 0, pending: 0 },
    money: { monthRevenue: 0, paidCount: 0, partnersBalance: 0 },
    partners: { total: 0, leads: 0 },
    recent: [],
    cron: { errors24h: 0, lastMessage: '', lastAt: '', lastSource: '' },
  };
  if (!(await requireSuperAdminAction())) return empty;

  const db = adminClient();
  const now = new Date();
  const startToday = new Date(dayStart(now)).toISOString();
  const startWeek = new Date(dayStart(now) + 7 * DAY_MS).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  try {
    const start24h = new Date(now.getTime() - DAY_MS).toISOString();
    const [biz, today, week, pending, pays, partnerAccounts, leadsCount, logs, errCount, lastErr] = await Promise.all([
      db.from('businesses').select('status').limit(5000),
      db.from('bookings').select('id', { head: true, count: 'exact' }).gte('scheduled_at', startToday).lt('scheduled_at', new Date(dayStart(now) + DAY_MS).toISOString()),
      db.from('bookings').select('id', { head: true, count: 'exact' }).gte('scheduled_at', startToday).lt('scheduled_at', startWeek),
      db.from('bookings').select('id', { head: true, count: 'exact' }).eq('status', 'new'),
      db.from('payments').select('amount').gte('paid_at', monthStart).limit(5000),
      // Баланс партнёра не хранится в partners: он считается по начислениям и выплатам.
      listPartnerAccounts().catch(() => []),
      db.from('partner_leads').select('id', { head: true, count: 'exact' }),
      // Ошибки фоновых задач в «активность» не подмешиваем: они сводятся в отдельный блок (cron),
      // иначе список из восьми строк целиком занимает один и тот же повторяющийся сбой.
      db.from('audit_log').select('id, action, entity, created_at').not('action', 'like', 'error:%').order('created_at', { ascending: false }).limit(8),
      db.from('audit_log').select('id', { head: true, count: 'exact' }).like('action', 'error:%').gte('created_at', start24h),
      db.from('audit_log').select('action, payload, created_at').like('action', 'error:%').order('created_at', { ascending: false }).limit(1),
    ]);

    const statuses = (biz.data ?? []).map((b) => String((b as { status?: string }).status ?? ''));
    const monthRevenue = (pays.data ?? []).reduce((sum, p) => sum + Number((p as { amount?: number }).amount ?? 0), 0);
    const partnersBalance = partnerAccounts.reduce((sum, p) => sum + Number(p.balance ?? 0), 0);

    return {
      ok: true,
      businesses: {
        total: statuses.filter((s) => s !== 'deleted').length,
        clients: statuses.filter((s) => s === 'client').length,
        moderation: statuses.filter((s) => s === 'new' || s === 'in_progress').length,
        suspended: statuses.filter((s) => s === 'refused' || s === 'archived').length,
      },
      bookings: { today: today.count ?? 0, week: week.count ?? 0, pending: pending.count ?? 0 },
      money: { monthRevenue, paidCount: (pays.data ?? []).length, partnersBalance },
      partners: { total: partnerAccounts.length, leads: leadsCount.count ?? 0 },
      recent: (logs.data ?? []).map((l) => {
        const row = l as { id: string; action?: string; entity?: string; created_at?: string };
        const action = row.action ?? '';
        return { id: row.id, action, label: auditActionLabel(action), entity: row.entity ?? '', created_at: row.created_at ?? '' };
      }),
      cron: {
        errors24h: errCount.count ?? 0,
        lastMessage: readErrorMessage(lastErr.data?.[0]),
        lastAt: (lastErr.data?.[0] as { created_at?: string } | undefined)?.created_at ?? '',
        lastSource: String((lastErr.data?.[0] as { action?: string } | undefined)?.action ?? '').replace('error:', ''),
      },
    };
  } catch {
    return empty;
  }
}

// ---------- бизнесы ----------

export type AdminBusiness = {
  id: string; name: string; slug: string; city: string | null; status: string;
  plan: string; category: string | null; subscriptionUntil: string | null; createdAt: string;
  bookingsToday: number; revenueMonth: number; telegram: boolean;
};

export async function getBusinessesAction(): Promise<{ ok: boolean; rows: AdminBusiness[] }> {
  if (!(await requireSuperAdminAction())) return { ok: false, rows: [] };
  const db = adminClient();
  const now = new Date();
  const startToday = new Date(dayStart(now)).toISOString();
  const endToday = new Date(dayStart(now) + DAY_MS).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  try {
    const [biz, today, pays] = await Promise.all([
      db.from('businesses').select('id, name, slug, city, status, plan, category, subscription_until, created_at, telegram_chat_id').order('created_at', { ascending: false }).limit(500),
      db.from('bookings').select('business_id').gte('scheduled_at', startToday).lt('scheduled_at', endToday).limit(5000),
      db.from('payments').select('business_id, amount').gte('paid_at', monthStart).limit(5000),
    ]);

    const todayCount = new Map<string, number>();
    for (const r of today.data ?? []) {
      const id = String((r as { business_id?: string }).business_id ?? '');
      if (id) todayCount.set(id, (todayCount.get(id) ?? 0) + 1);
    }
    const revenue = new Map<string, number>();
    for (const r of pays.data ?? []) {
      const row = r as { business_id?: string; amount?: number };
      const id = String(row.business_id ?? '');
      if (id) revenue.set(id, (revenue.get(id) ?? 0) + Number(row.amount ?? 0));
    }

    const rows: AdminBusiness[] = (biz.data ?? []).map((b) => {
      const row = b as Record<string, unknown>;
      const id = String(row.id);
      return {
        id,
        name: String(row.name ?? 'Без названия'),
        slug: String(row.slug ?? ''),
        city: row.city ? String(row.city) : null,
        status: String(row.status ?? 'new'),
        plan: String(row.plan ?? 'basic'),
        category: row.category ? String(row.category) : null,
        subscriptionUntil: row.subscription_until ? String(row.subscription_until) : null,
        createdAt: String(row.created_at ?? ''),
        bookingsToday: todayCount.get(id) ?? 0,
        revenueMonth: revenue.get(id) ?? 0,
        telegram: Boolean(row.telegram_chat_id),
      };
    });
    return { ok: true, rows };
  } catch {
    return { ok: false, rows: [] };
  }
}

// Смена статуса бизнеса из админки (одобрение, приостановка, отказ).
export async function setBusinessStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireSuperAdminAction())) return { ok: false, error: 'Доступ запрещён' };
  const allowed = ['new', 'in_progress', 'approved', 'client', 'refused', 'archived'];
  if (!allowed.includes(status)) return { ok: false, error: 'Недопустимый статус' };
  const { error } = await adminClient().from('businesses').update({ status }).eq('id', id);
  if (error) return { ok: false, error: 'Не удалось изменить статус' };
  await audit('admin.business_status', 'business', id, { status });
  return { ok: true };
}

// ---------- модерация: очередь заявок ----------

export type ModerationRow = { id: string; name: string; slug: string; city: string | null; status: string; createdAt: string; hasSite: boolean };

export async function getModerationQueueAction(): Promise<ModerationRow[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('businesses')
      .select('id, name, slug, city, status, created_at, preview_url')
      .in('status', ['new', 'in_progress'])
      .order('created_at', { ascending: true })
      .limit(200);
    return (data ?? []).map((b) => {
      const row = b as Record<string, unknown>;
      return {
        id: String(row.id),
        name: String(row.name ?? 'Без названия'),
        slug: String(row.slug ?? ''),
        city: row.city ? String(row.city) : null,
        status: String(row.status ?? 'new'),
        createdAt: String(row.created_at ?? ''),
        hasSite: Boolean(row.preview_url),
      };
    });
  } catch {
    return [];
  }
}

// ---------- трафик: записи ----------

export type AdminBooking = {
  id: string; businessId: string; business: string; client: string; phone: string | null;
  scheduledAt: string; status: string; service: string;
};

export async function getBookingsAction(): Promise<AdminBooking[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('bookings')
      .select('id, business_id, client_name, client_phone, scheduled_at, status, service_id, services(name), businesses(name)')
      .order('scheduled_at', { ascending: false })
      .limit(300);
    return (data ?? []).map((b) => {
      const row = b as Record<string, unknown>;
      const service = (row.services as { name?: string } | null)?.name;
      const business = (row.businesses as { name?: string } | null)?.name;
      return {
        id: String(row.id),
        businessId: String(row.business_id ?? ''),
        business: business ?? '—',
        client: String(row.client_name ?? 'Без имени'),
        phone: row.client_phone ? String(row.client_phone) : null,
        scheduledAt: String(row.scheduled_at ?? ''),
        status: String(row.status ?? 'new'),
        service: service ?? '—',
      };
    });
  } catch {
    return [];
  }
}

// ---------- пользователи платформы ----------

export type PlatformUser = { id: string; email: string; name: string | null; role: string; source: 'super_admin' | 'admin_user'; createdAt: string };

export async function getPlatformUsersAction(): Promise<PlatformUser[]> {
  if (!(await requireSuperAdminAction())) return [];
  const db = adminClient();
  try {
    const [supers, admins] = await Promise.all([
      db.from('super_admins').select('id, email, name, created_at').limit(200),
      db.from('admin_users').select('id, email, role, created_at').limit(500),
    ]);
    const rows: PlatformUser[] = [];
    for (const s of supers.data ?? []) {
      const row = s as Record<string, unknown>;
      rows.push({ id: String(row.id), email: String(row.email ?? ''), name: row.name ? String(row.name) : null, role: 'super_admin', source: 'super_admin', createdAt: String(row.created_at ?? '') });
    }
    for (const a of admins.data ?? []) {
      const row = a as Record<string, unknown>;
      rows.push({ id: String(row.id), email: String(row.email ?? ''), name: null, role: String(row.role ?? 'manager'), source: 'admin_user', createdAt: String(row.created_at ?? '') });
    }
    return rows;
  } catch {
    return [];
  }
}

// ---------- финансы ----------

export type AdminPayment = { id: string; businessId: string; business: string; amount: number; type: string; paidAt: string | null; note: string | null };

export async function getPaymentsAction(): Promise<AdminPayment[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('payments')
      .select('id, business_id, amount, type, paid_at, note, businesses(name)')
      .order('created_at', { ascending: false })
      .limit(300);
    return (data ?? []).map((p) => {
      const row = p as Record<string, unknown>;
      return {
        id: String(row.id),
        businessId: String(row.business_id ?? ''),
        business: (row.businesses as { name?: string } | null)?.name ?? '—',
        amount: Number(row.amount ?? 0),
        type: String(row.type ?? '—'),
        paidAt: row.paid_at ? String(row.paid_at) : null,
        note: row.note ? String(row.note) : null,
      };
    });
  } catch {
    return [];
  }
}

// ---------- журнал действий ----------

export type AuditRow = { id: string; action: string; entity: string; entityId: string | null; createdAt: string; payload: string };

export async function getAuditLogAction(limit = 200): Promise<AuditRow[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('audit_log')
      .select('id, action, entity, entity_id, created_at, payload')
      .order('created_at', { ascending: false })
      .limit(Math.min(500, Math.max(1, limit)));
    return (data ?? []).map((a) => {
      const row = a as Record<string, unknown>;
      const payload = row.payload ? JSON.stringify(row.payload) : '';
      return {
        id: String(row.id),
        action: String(row.action ?? ''),
        entity: String(row.entity ?? ''),
        entityId: row.entity_id ? String(row.entity_id) : null,
        createdAt: String(row.created_at ?? ''),
        payload: payload.length > 160 ? `${payload.slice(0, 160)}…` : payload,
      };
    });
  } catch {
    return [];
  }
}

// ---------- лиды (партнёрская программа и входящие) ----------

export type AdminLead = { id: string; name: string; phone: string | null; email: string | null; message: string | null; status: string; createdAt: string };

export async function getLeadsAction(): Promise<AdminLead[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('leads')
      .select('id, name, phone, email, message, status, created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    return (data ?? []).map((l) => {
      const row = l as Record<string, unknown>;
      return {
        id: String(row.id),
        name: String(row.name ?? 'Без имени'),
        phone: row.phone ? String(row.phone) : null,
        email: row.email ? String(row.email) : null,
        message: row.message ? String(row.message) : null,
        status: String(row.status ?? 'new'),
        createdAt: String(row.created_at ?? ''),
      };
    });
  } catch {
    return [];
  }
}

// ---------- поддержка ----------

export type AdminTicket = { id: string; email: string | null; subject: string; message: string; status: string; priority: string; assignedTo: string | null; createdAt: string };

export async function getTicketsAction(): Promise<AdminTicket[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('support_tickets')
      .select('id, email, subject, message, status, priority, assigned_to, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    return (data ?? []).map((t) => {
      const row = t as Record<string, unknown>;
      return {
        id: String(row.id),
        email: row.email ? String(row.email) : null,
        subject: String(row.subject ?? 'Без темы'),
        message: String(row.message ?? ''),
        status: String(row.status ?? 'open'),
        priority: String(row.priority ?? 'normal'),
        assignedTo: row.assigned_to ? String(row.assigned_to) : null,
        createdAt: String(row.created_at ?? ''),
      };
    });
  } catch {
    return [];
  }
}

export async function setTicketStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireSuperAdminAction())) return { ok: false, error: 'Доступ запрещён' };
  if (!['open', 'in_progress', 'done', 'rejected'].includes(status)) return { ok: false, error: 'Недопустимый статус' };
  const patch: Record<string, unknown> = { status };
  if (status === 'done' || status === 'rejected') patch.closed_at = new Date().toISOString();
  const { error } = await adminClient().from('support_tickets').update(patch).eq('id', id);
  if (error) return { ok: false, error: 'Не удалось обновить тикет' };
  await audit('admin.ticket_status', 'support_ticket', id, { status });
  return { ok: true };
}

// ---------- промокоды ----------

export type AdminPromo = { id: string; code: string; type: string; value: number; maxUses: number; used: number; validUntil: string | null; active: boolean };

export async function getPromoCodesAction(): Promise<AdminPromo[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('promo_codes')
      .select('id, code, discount_type, discount_value, max_uses, used_count, valid_until, is_active')
      .order('code', { ascending: true })
      .limit(200);
    return (data ?? []).map((p) => {
      const row = p as Record<string, unknown>;
      return {
        id: String(row.id),
        code: String(row.code ?? ''),
        type: String(row.discount_type ?? 'percent'),
        value: Number(row.discount_value ?? 0),
        maxUses: Number(row.max_uses ?? 0),
        used: Number(row.used_count ?? 0),
        validUntil: row.valid_until ? String(row.valid_until) : null,
        active: Boolean(row.is_active),
      };
    });
  } catch {
    return [];
  }
}

// ---------- вебхуки (входящие события) ----------

export type AdminWebhookEvent = { id: string; source: string; eventId: string | null; processedAt: string | null; createdAt: string };

export async function getWebhookEventsAction(): Promise<AdminWebhookEvent[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('webhook_events')
      .select('id, source, event_id, processed_at, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    return (data ?? []).map((w) => {
      const row = w as Record<string, unknown>;
      return {
        id: String(row.id),
        source: String(row.source ?? '—'),
        eventId: row.event_id ? String(row.event_id) : null,
        processedAt: row.processed_at ? String(row.processed_at) : null,
        createdAt: String(row.created_at ?? ''),
      };
    });
  } catch {
    return [];
  }
}

// ---------- галерея (фотографии всех бизнесов) ----------

export type AdminPhoto = { id: string; businessId: string; business: string; url: string; alt: string | null; createdAt: string };

export async function getPhotosAction(): Promise<AdminPhoto[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('photos')
      .select('id, business_id, url, alt, businesses(name)')
      .order('id', { ascending: false })
      .limit(200);
    return (data ?? []).map((p) => {
      const row = p as Record<string, unknown>;
      return {
        id: String(row.id),
        businessId: String(row.business_id ?? ''),
        business: (row.businesses as { name?: string } | null)?.name ?? '—',
        url: String(row.url ?? ''),
        alt: row.alt ? String(row.alt) : null,
        createdAt: '',
      };
    });
  } catch {
    return [];
  }
}

// ---------- каталог услуг платформы ----------

export type AdminService = { id: string; business: string; name: string; price: number; duration: number; active: boolean };

export async function getAllServicesAction(): Promise<AdminService[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('services')
      .select('id, name, price, duration_minutes, is_active, businesses(name)')
      .order('name', { ascending: true })
      .limit(500);
    return (data ?? []).map((s) => {
      const row = s as Record<string, unknown>;
      return {
        id: String(row.id),
        business: (row.businesses as { name?: string } | null)?.name ?? '—',
        name: String(row.name ?? ''),
        price: Number(row.price ?? 0),
        duration: Number(row.duration_minutes ?? 0),
        active: Boolean(row.is_active),
      };
    });
  } catch {
    return [];
  }
}

// ---------- география: города присутствия ----------

export type CityRow = { city: string; businesses: number; clients: number };

export async function getCitiesAction(): Promise<CityRow[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient().from('businesses').select('city, status').limit(5000);
    const map = new Map<string, { businesses: number; clients: number }>();
    for (const b of data ?? []) {
      const row = b as { city?: string; status?: string };
      const city = (row.city ?? '').trim() || 'Без города';
      const acc = map.get(city) ?? { businesses: 0, clients: 0 };
      acc.businesses += 1;
      if (row.status === 'client') acc.clients += 1;
      map.set(city, acc);
    }
    return [...map.entries()]
      .map(([city, v]) => ({ city, ...v }))
      .sort((a, b) => b.businesses - a.businesses);
  } catch {
    return [];
  }
}

// ---------- клиенты: агрегируем по записям (отдельной таблицы клиентов нет) ----------

export type AdminClientRow = { key: string; name: string; phone: string | null; email: string | null; bookings: number; lastVisit: string };

export async function getClientsFromBookingsAction(): Promise<AdminClientRow[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('bookings')
      .select('client_name, client_phone, client_email, scheduled_at')
      .order('scheduled_at', { ascending: false })
      .limit(2000);
    const map = new Map<string, AdminClientRow>();
    for (const b of data ?? []) {
      const row = b as { client_name?: string; client_phone?: string; client_email?: string; scheduled_at?: string };
      const name = (row.client_name ?? '').trim() || 'Без имени';
      const phone = row.client_phone ?? null;
      const key = `${name}|${phone ?? ''}`;
      const prev = map.get(key);
      const when = String(row.scheduled_at ?? '');
      if (prev) {
        prev.bookings += 1;
        if (!prev.email && row.client_email) prev.email = row.client_email;
        if (when > prev.lastVisit) prev.lastVisit = when;
      } else {
        map.set(key, { key, name, phone, email: row.client_email ?? null, bookings: 1, lastVisit: when });
      }
    }
    return [...map.values()].sort((a, b) => b.lastVisit.localeCompare(a.lastVisit)).slice(0, 300);
  } catch {
    return [];
  }
}

// ---------- локации: адреса бизнесов ----------

export type AdminLocation = { id: string; business: string; address: string; city: string | null };

export async function getLocationsAction(): Promise<AdminLocation[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('businesses')
      .select('id, name, address, city')
      .not('address', 'is', null)
      .limit(500);
    return (data ?? []).map((b) => {
      const row = b as Record<string, unknown>;
      return {
        id: String(row.id),
        business: String(row.name ?? '—'),
        address: String(row.address ?? ''),
        city: row.city ? String(row.city) : null,
      };
    });
  } catch {
    return [];
  }
}

// ---------- создание бизнеса из админки ----------

// Транслитерация в slug: латиница, цифры, дефис. Нужна, потому что slug — часть публичного адреса.
function slugify(value: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return value
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export async function createBusinessAction(input: { name: string; city: string; category?: string }): Promise<{ ok: boolean; error?: string; slug?: string }> {
  if (!(await requireSuperAdminAction())) return { ok: false, error: 'Доступ запрещён' };
  const name = String(input.name ?? '').trim();
  if (name.length < 2) return { ok: false, error: 'Название слишком короткое' };

  const db = adminClient();
  const base = slugify(name) || `biz-${Date.now().toString(36)}`;

  // Слаг должен быть уникальным: пробуем base, base-2, base-3 …
  let slug = base;
  for (let i = 2; i <= 20; i += 1) {
    const { data } = await db.from('businesses').select('id').eq('slug', slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${i}`;
  }

  const { error } = await db.from('businesses').insert({
    slug,
    name,
    city: String(input.city ?? '').trim() || null,
    category: String(input.category ?? '').trim() || null,
    status: 'new',
  });
  if (error) return { ok: false, error: error.message.includes('duplicate') ? 'Такой адрес уже занят' : 'Не удалось создать бизнес' };
  await audit('admin.business_created', 'business', null, { slug, name });
  return { ok: true, slug };
}

// ---------- телеграм-бот: реальная статистика ----------

export type BotStats = { subscribers: number; businesses: number; sentBroadcasts: number; lastBroadcast: string | null };

export async function getBotStatsAction(): Promise<BotStats> {
  if (!(await requireSuperAdminAction())) return { subscribers: 0, businesses: 0, sentBroadcasts: 0, lastBroadcast: null };
  const db = adminClient();
  try {
    const [withBot, total, broadcasts] = await Promise.all([
      db.from('businesses').select('id', { head: true, count: 'exact' }).not('telegram_chat_id', 'is', null),
      db.from('businesses').select('id', { head: true, count: 'exact' }),
      db.from('audit_log').select('created_at').eq('action', 'platform.broadcast_sent').order('created_at', { ascending: false }).limit(20),
    ]);
    return {
      subscribers: withBot.count ?? 0,
      businesses: total.count ?? 0,
      sentBroadcasts: (broadcasts.data ?? []).length,
      lastBroadcast: (broadcasts.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null,
    };
  } catch {
    return { subscribers: 0, businesses: 0, sentBroadcasts: 0, lastBroadcast: null };
  }
}

// История рассылок — из журнала: каждое реальное отправление пишет событие platform.broadcast_sent.
export type BroadcastRow = { id: string; createdAt: string; sent: number; failed: number; total: number };

export async function getBroadcastHistoryAction(): Promise<BroadcastRow[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('audit_log')
      .select('id, created_at, payload')
      .eq('action', 'platform.broadcast_sent')
      .order('created_at', { ascending: false })
      .limit(30);
    return (data ?? []).map((r) => {
      const row = r as { id: string; created_at?: string; payload?: { sent?: number; failed?: number; total?: number } };
      return {
        id: row.id,
        createdAt: row.created_at ?? '',
        sent: Number(row.payload?.sent ?? 0),
        failed: Number(row.payload?.failed ?? 0),
        total: Number(row.payload?.total ?? 0),
      };
    });
  } catch {
    return [];
  }
}

// ---------- рост: воронка и подписки по реальным данным ----------

export type GrowthStats = {
  funnel: { total: number; inProgress: number; approved: number; clients: number; refused: number };
  subs: { active: number; expiring7: number; expired: number };
  money: { monthTotal: number; monthCount: number; avg: number };
};

export async function getGrowthStatsAction(): Promise<GrowthStats> {
  const empty: GrowthStats = {
    funnel: { total: 0, inProgress: 0, approved: 0, clients: 0, refused: 0 },
    subs: { active: 0, expiring7: 0, expired: 0 },
    money: { monthTotal: 0, monthCount: 0, avg: 0 },
  };
  if (!(await requireSuperAdminAction())) return empty;
  const db = adminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const in7 = new Date(now.getTime() + 7 * DAY_MS).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  try {
    const [biz, pays] = await Promise.all([
      db.from('businesses').select('status, subscription_active, subscription_until').limit(5000),
      db.from('payments').select('amount').gte('paid_at', monthStart).limit(5000),
    ]);
    const rows = (biz.data ?? []) as { status?: string; subscription_active?: boolean; subscription_until?: string | null }[];
    const monthTotal = (pays.data ?? []).reduce((sum, p) => sum + Number((p as { amount?: number }).amount ?? 0), 0);
    const monthCount = (pays.data ?? []).length;

    return {
      funnel: {
        total: rows.filter((r) => r.status !== 'deleted').length,
        inProgress: rows.filter((r) => r.status === 'new' || r.status === 'in_progress').length,
        approved: rows.filter((r) => r.status === 'approved').length,
        clients: rows.filter((r) => r.status === 'client').length,
        refused: rows.filter((r) => r.status === 'refused' || r.status === 'archived').length,
      },
      subs: {
        active: rows.filter((r) => r.subscription_active === true).length,
        expiring7: rows.filter((r) => r.subscription_active === true && r.subscription_until && r.subscription_until >= today && r.subscription_until <= in7).length,
        expired: rows.filter((r) => r.subscription_until && r.subscription_until < today).length,
      },
      money: { monthTotal, monthCount, avg: monthCount ? Math.round(monthTotal / monthCount) : 0 },
    };
  } catch {
    return empty;
  }
}

// ---------- домены: реальные кастомные домены бизнесов ----------

export type DomainRow = { id: string; business: string; domain: string; subscriptionUntil: string | null; active: boolean };

export async function getDomainsAction(): Promise<DomainRow[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('businesses')
      .select('id, name, custom_domain, subscription_until, subscription_active')
      .not('custom_domain', 'is', null)
      .limit(300);
    return (data ?? []).map((b) => {
      const row = b as Record<string, unknown>;
      return {
        id: String(row.id),
        business: String(row.name ?? '—'),
        domain: String(row.custom_domain ?? ''),
        subscriptionUntil: row.subscription_until ? String(row.subscription_until) : null,
        active: Boolean(row.subscription_active),
      };
    });
  } catch {
    return [];
  }
}
