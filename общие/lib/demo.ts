// lib/demo.ts — серверная часть демо-кабинетов (⚠️ только сервер: crypto + service_role).
// Идемпотентно создаёт демо-партнёра и демо-бизнес с реальными данными в БД. Дальше кабинеты
// работают штатными server actions: лиды, счета, начисления, услуги, записи, фото — всё настоящее,
// но изолировано в отдельных демо-аккаунтах, поэтому реальные данные не затрагиваются.
import { randomBytes, scryptSync } from 'crypto';
import { adminClient } from './supabase';
import {
  DEMO_BUSINESS_NAME,
  DEMO_OWNER_EMAIL,
  DEMO_PARTNER_EMAIL,
  DEMO_PARTNER_NAME,
  DEMO_PARTNER_REF,
  DEMO_PASSWORD,
  DEMO_PREFIX,
  DEMO_SLUG,
} from './demo-constants';

// Тот же формат, что lib/partners-auth.ts: scrypt$<salt b64>$<hash b64>.
function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

const WORKING_HOURS = {
  mon: { from: '10:00', to: '20:00' },
  tue: { from: '10:00', to: '20:00' },
  wed: { from: '10:00', to: '20:00' },
  thu: { from: '10:00', to: '20:00' },
  fri: { from: '10:00', to: '21:00' },
  sat: { from: '11:00', to: '18:00' },
  sun: { from: '11:00', to: '16:00' },
};

// ---------- партнёр ----------

async function seedPartnerData(partnerId: string): Promise<void> {
  const db = adminClient();

  const { count: leads } = await db
    .from('partner_leads').select('id', { count: 'exact', head: true }).eq('partner_id', partnerId);
  if (!leads) {
    await db.from('partner_leads').insert([
      { partner_id: partnerId, name: 'Анна, салон красоты', phone: '+7 900 111-22-33', email: 'anna@example.ru', status: 'contacted', source: 'demo' },
      { partner_id: partnerId, name: 'Игорь, автосервис', phone: '+7 900 444-55-66', status: 'new', source: 'demo' },
      { partner_id: partnerId, name: 'Марина, студия йоги', email: 'mary@example.ru', status: 'converted', source: 'demo' },
    ]);
  }

  const { count: checkouts } = await db
    .from('partner_checkouts').select('id', { count: 'exact', head: true }).eq('partner_id', partnerId);
  if (!checkouts) {
    const now = new Date().toISOString();
    const { data: created } = await db.from('partner_checkouts').insert([
      {
        partner_id: partnerId, variant: 'subscription_5000', amount: 5000, partner_commission: 1000,
        commission_type: 'recurring_monthly', entrepreneur_name: 'Анна, салон красоты',
        entrepreneur_email: 'anna@example.ru', status: 'paid', paid_at: now,
      },
      {
        partner_id: partnerId, variant: 'code_5000', amount: 5000, partner_commission: 1000,
        commission_type: 'one_time', entrepreneur_name: 'Марина, студия йоги',
        entrepreneur_email: 'mary@example.ru', status: 'paid', paid_at: now,
      },
      {
        partner_id: partnerId, variant: 'custom', amount: 20000, partner_commission: 5000,
        commission_type: 'one_time', entrepreneur_name: 'Игорь, автосервис',
        entrepreneur_phone: '+7 900 444-55-66', status: 'awaiting_payment',
      },
    ]).select('id, partner_commission, commission_type, status');
    const paid = (created ?? []).filter((c) => c.status === 'paid');
    if (paid.length) {
      await db.from('partner_earnings').insert(paid.map((c) => ({
        partner_id: partnerId,
        checkout_id: c.id,
        amount: c.partner_commission,
        type: c.commission_type,
        status: 'accrued',
      })));
    }
  }
}

export async function ensureDemoPartner(): Promise<{ id: string }> {
  const db = adminClient();
  const { data: existing } = await db
    .from('partners').select('id').eq('email', DEMO_PARTNER_EMAIL).maybeSingle<{ id: string }>();

  let partnerId = existing?.id ?? null;
  if (!partnerId) {
    const { data, error } = await db.from('partners').insert({
      email: DEMO_PARTNER_EMAIL,
      name: DEMO_PARTNER_NAME,
      password_hash: hashPassword(DEMO_PASSWORD),
      referral_code: DEMO_PARTNER_REF,
      status: 'active',
    }).select('id').single<{ id: string }>();
    if (error) throw new Error(`demo partner: ${error.message}`);
    partnerId = data.id;
  }

  await seedPartnerData(partnerId);
  return { id: partnerId };
}

// ---------- бизнес ----------

async function seedBusinessData(businessId: string): Promise<void> {
  const db = adminClient();

  let { data: services } = await db
    .from('services').select('id').eq('business_id', businessId).order('sort_order')
    .returns<{ id: string }[]>();
  if (!services?.length) {
    const { data } = await db.from('services').insert([
      { business_id: businessId, name: 'Классический маникюр', price: 1500, duration_minutes: 60, sort_order: 1, is_active: true },
      { business_id: businessId, name: 'Гель-лак', price: 2000, duration_minutes: 90, sort_order: 2, is_active: true },
      { business_id: businessId, name: 'Наращивание', price: 3500, duration_minutes: 150, sort_order: 3, is_active: true },
      { business_id: businessId, name: 'Дизайн ногтей', price: 500, duration_minutes: 15, sort_order: 4, is_active: true },
      { business_id: businessId, name: 'Педикюр', price: 2500, duration_minutes: 60, sort_order: 5, is_active: true },
    ]).select('id').returns<{ id: string }[]>();
    services = data ?? [];
  }

  const { count: photos } = await db
    .from('photos').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
  if (!photos) {
    await db.from('photos').insert([
      { business_id: businessId, url: '/media/covers/beauty.svg', alt: 'Работа мастера', sort_order: 0 },
      { business_id: businessId, url: '/media/covers/detailing.svg', alt: 'Студия', sort_order: 1 },
    ]);
  }

  const { count: bookings } = await db
    .from('bookings').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
  if (!bookings && services?.length) {
    const base = Date.now() + 24 * 3600 * 1000;
    const at = (h: number) => new Date(base + h * 3600 * 1000).toISOString();
    const privacy = { privacy_accepted_at: new Date().toISOString(), privacy_version: 'demo' };
    await db.from('bookings').insert([
      { business_id: businessId, client_name: 'Ольга', client_phone: '+7 900 111-11-11', service_id: services[0].id, scheduled_at: at(1), status: 'new', ...privacy },
      { business_id: businessId, client_name: 'Екатерина', client_phone: '+7 900 222-22-22', service_id: services[1].id, scheduled_at: at(3), status: 'confirmed', ...privacy },
      { business_id: businessId, client_name: 'Дарья', client_phone: '+7 900 333-33-33', service_id: services[2].id, scheduled_at: at(-24), status: 'done', ...privacy },
      { business_id: businessId, client_name: 'Светлана', client_phone: '+7 900 444-44-44', service_id: services[3].id, scheduled_at: at(-48), status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: 'client', ...privacy },
    ]);
  }
}

async function findAuthUserId(email: string): Promise<string | null> {
  try {
    const { data } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
    return (data.users ?? []).find((u) => u.email?.toLowerCase() === email)?.id ?? null;
  } catch {
    return null;
  }
}

async function ensureDemoOwner(businessId: string): Promise<string> {
  const db = adminClient();
  let userId = await findAuthUserId(DEMO_OWNER_EMAIL);
  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({
      email: DEMO_OWNER_EMAIL, password: DEMO_PASSWORD, email_confirm: true,
    });
    userId = data.user?.id ?? null;
    if (!userId) {
      // Параллельный запрос мог создать пользователя — пробуем найти ещё раз.
      userId = await findAuthUserId(DEMO_OWNER_EMAIL);
      if (!userId) throw new Error(`demo owner: ${error?.message ?? 'не удалось создать пользователя'}`);
    }
  }

  const { data: member } = await db
    .from('admin_users').select('id').eq('business_id', businessId).eq('email', DEMO_OWNER_EMAIL)
    .maybeSingle<{ id: string }>();
  if (!member) {
    await db.from('admin_users').insert({
      business_id: businessId, email: DEMO_OWNER_EMAIL, role: 'owner', auth_user_id: userId,
    });
  } else {
    await db.from('admin_users').update({ auth_user_id: userId }).eq('id', member.id);
  }
  return userId;
}

export async function ensureDemoBusiness(): Promise<{ businessId: string }> {
  const db = adminClient();
  const { data: template } = await db
    .from('vertical_templates').select('id').eq('url_prefix', DEMO_PREFIX).maybeSingle<{ id: string }>();
  if (!template) throw new Error(`demo: шаблон ниши '${DEMO_PREFIX}' не найден (накатана ли 0003_seed?)`);

  const { data: existing } = await db
    .from('businesses').select('id').eq('slug', DEMO_SLUG).maybeSingle<{ id: string }>();

  let businessId = existing?.id ?? null;
  if (!businessId) {
    const { data, error } = await db.from('businesses').insert({
      slug: DEMO_SLUG,
      name: DEMO_BUSINESS_NAME,
      description: 'Демонстрационный сайт с онлайн-записью: услуги, фото, расписание и кабинет владельца. Данные можно менять — это песочница.',
      vertical_template_id: template.id,
      category: 'Красота',
      address: 'г. Москва, ул. Демонстрационная, 1',
      city: 'Москва',
      region: 'Москва',
      postal_code: '101000',
      working_hours: WORKING_HOURS,
      slot_step_minutes: 30,
      cancel_hours_before: 3,
      min_hours_before: 2,
      max_days_ahead: 30,
      auto_confirm: false,
      phones: ['+7 (999) 000-00-00'],
      emails: ['demo@zapishisya.ru'],
      websites: [],
      socials: { telegram: '@demo_studio' },
      rating: 4.9,
      reviews_count: 127,
      brand_color: '#d977a6',
      status: 'client',
      plan: 'basic',
      subscription_active: true,
      subscription_until: '2030-01-01',
      subscription_started_at: new Date().toISOString(),
    }).select('id').single<{ id: string }>();
    if (error) throw new Error(`demo business: ${error.message}`);
    businessId = data.id;
  }

  await seedBusinessData(businessId);
  await ensureDemoOwner(businessId);
  return { businessId };
}
