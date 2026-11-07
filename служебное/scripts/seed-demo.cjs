// scripts/seed-demo.cjs — засев демо-бизнеса (статус 'client', подписка активна)
// через supabase-js с service_role ключом (обходит RLS). Демо-данные idempotentны:
// если бизнес со slug уже есть — повторная вставка пропускается.
//
// Запуск: node scripts/seed-demo.cjs
// (ключи берутся из .env рядом с проектом)

const fs = require('node:fs');
const path = require('node:path');

function loadEnv(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv(path.join(process.cwd(), '.env'));
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('❌ Нет NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в .env');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Параметры демо-бизнеса
const PREFIX = 'm'; // маникюр (vertical_templates.url_prefix = 'm')
const SLUG = 'lyubava';

async function main() {
  // 1) шаблон ниши
  const { data: tmpl, error: te } = await supabase
    .from('vertical_templates')
    .select('id, name, url_prefix')
    .eq('url_prefix', PREFIX)
    .maybeSingle();
  if (te) throw te;
  if (!tmpl) throw new Error(`Шаблон с url_prefix='${PREFIX}' не найден (0003_seed не накатан?)`);
  console.log(`✓ Шаблон ниши: ${tmpl.name} (id=${tmpl.id}, prefix=${tmpl.url_prefix})`);

  // 2) уже существует?
  const { data: existing } = await supabase
    .from('businesses')
    .select('id, slug, status')
    .eq('slug', SLUG)
    .maybeSingle();
  if (existing) {
    console.log(`⏭️  Бизнес slug='${SLUG}' уже есть (id=${existing.id}, status=${existing.status}). Пропускаем.`);
    console.log(`🌐 URL: ${SUPABASE_URL.replace('https://', 'http://').replace(/\.supabase\.co$/, '') ? `http://localhost:3000/${PREFIX}/${SLUG}` : ''}`);
    console.log(`🌐 Локально: http://localhost:3000/${PREFIX}/${SLUG}`);
    return;
  }

  // 3) вставляем бизнес
  const { data: biz, error: be } = await supabase
    .from('businesses')
    .insert({
      slug: SLUG,
      name: 'Студия маникюра «Любава»',
      description:
        'Уютная студия маникюра и педикюра в центре города. Опытные мастера, премиальные материалы, онлайн-запись без звонков.',
      vertical_template_id: tmpl.id,
      category: 'Красота',
      address: 'г. Москва, ул. Примерная, 12, оф. 3',
      city: 'Москва',
      region: 'Москва',
      postal_code: '101000',
      working_hours: {
        mon: { from: '10:00', to: '20:00' },
        tue: { from: '10:00', to: '20:00' },
        wed: { from: '10:00', to: '20:00' },
        thu: { from: '10:00', to: '20:00' },
        fri: { from: '10:00', to: '21:00' },
        sat: { from: '11:00', to: '18:00' },
        sun: { from: '11:00', to: '16:00' },
      },
      slot_step_minutes: 30,
      cancel_hours_before: 3,
      min_hours_before: 2,
      max_days_ahead: 30,
      auto_confirm: false,
      phones: ['+7 (999) 123-45-67'],
      emails: ['studio@lyubava.example'],
      websites: ['https://lyubava.example'],
      socials: { instagram: '@lyubava_studio', telegram: '@lyubava_bot' },
      rating: 4.9,
      reviews_count: 127,
      brand_color: '#d977a6',
      status: 'client',
      plan: 'basic',
      subscription_active: true,
      subscription_until: '2030-01-01',
      subscription_started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (be) throw be;
  console.log(`✓ Бизнес создан: id=${biz.id}`);

  // 4) услуги (из default_services шаблона маникюра)
  const services = [
    { name: 'Классический маникюр', price: 1500, duration_minutes: 60, sort_order: 1 },
    { name: 'Гель-лак', price: 2000, duration_minutes: 90, sort_order: 2 },
    { name: 'Наращивание', price: 3500, duration_minutes: 150, sort_order: 3 },
    { name: 'Дизайн ногтей', price: 500, duration_minutes: 15, sort_order: 4 },
    { name: 'Педикюр', price: 2500, duration_minutes: 60, sort_order: 5 },
  ];
  const { error: se } = await supabase
    .from('services')
    .insert(services.map((s) => ({ ...s, business_id: biz.id, is_active: true })));
  if (se) throw se;
  console.log(`✓ Услуг добавлено: ${services.length}`);

  console.log('');
  console.log('🎉 Демо-бизнес засеян!');
  console.log(`🌐 Открыть локально: http://localhost:3000/${PREFIX}/${SLUG}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Ошибка засева:', e.message || e);
    process.exit(1);
  });
