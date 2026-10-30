// lib/transfer.ts — передача кода клиенту (ТЗ 4.0 §14.4, §5.9): один .txt вместо ZIP.
// Почему .txt: Vercel Hobby maxDuration = 10 с, archiver + zlib не укладывается гарантированно. Формат — разделы
// «=== ИМЯ ФАЙЛА ===», клиент сохраняет каждый раздел в отдельный файл (инструкция в начале).
//
// Идемпотентность: первый вызов фиксирует code_transferred_at и support_until = +30 дней. Повторное скачивание
// отдаёт тот же файл и НЕ продлевает поддержку (раньше каждый клик сдвигал support_until).
// Секреты: в README ключей нет. Персональный ключ лицензии (производный, см. lib/license-server.ts) — только в
// разделе .env.example; мастер-секрет LICENSE_HMAC_SECRET сервиса в файл не попадает никогда.
import { UNBOUND_DOMAIN, deriveLicenseKey } from './license-server';
import { adminClient } from './supabase';
import { audit } from './audit';

export const SUPPORT_DAYS = 30; // §14.4: поддержка 30 дней после передачи
const DAY_MS = 86_400_000;
export const SECTION_RE = /^=== (.+) ===$/;

// Порядок миграций для клиента. Новая миграция в supabase/migrations → добавить сюда (рантайм Vercel не видит файлы).
export const MIGRATION_FILES = [
  'supabase/migrations/0001_init.sql',
  'supabase/migrations/0002_lifecycle.sql',
  'supabase/migrations/0003_seed.sql',
  'supabase/migrations/0004_features.sql',
  'supabase/migrations/0005_indexes.sql',
  'supabase/migrations/0006_partitions.sql',
  'supabase/migrations/0007_rls_audit.sql',
  'supabase/migrations/0008_pg_cron.sql',
  'supabase/migrations/0009_retention.sql',
  'supabase/migrations/0010_partitions.sql',
  'supabase/migrations/0011_analytics.sql',
  'supabase/migrations/0012_rate_limit_hit.sql',
  'supabase/migrations/0013_data_requests_types.sql',
  'supabase/migrations/0014_partition_bookings.sql',
] as const;

export type TransferBusiness = {
  id: string;
  name: string;
  slug: string;
  status: string;
  custom_domain: string | null;
  license_id: string | null;
  code_transferred_at: string | null;
  support_until: string | null;
};

export interface TransferStore {
  findBusiness(id: string): Promise<TransferBusiness | null>;
  // Существующая лицензия бизнеса или новая. Возвращает license_id.
  ensureLicense(b: TransferBusiness): Promise<string | null>;
  // Ставит code_transferred_at/support_until только если они ещё пусты (условие в where). Возвращает итоговые значения.
  markTransferred(id: string, at: string, support_until: string): Promise<{ code_transferred_at: string; support_until: string } | null>;
  audit(business_id: string, payload: Record<string, unknown>): Promise<void>;
}

export type TransferResult =
  | { ok: true; file_name: string; text: string; first_time: boolean }
  | { ok: false; http_status: number; reason: 'bad_id' | 'not_found' | 'not_client' | 'license' | 'db' };

const TRANSFER_STATUSES = new Set(['client', 'transferred_out']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function safeSlug(slug: string): string {
  const s = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s || 'site';
}

export function transferFileName(slug: string): string {
  return `transfer-${safeSlug(slug)}.txt`;
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

// ---------- Содержимое ----------

export type TransferContent = {
  business_name: string;
  license_id: string;
  license_key: string | null; // производный ключ; null — мастер-секрет на сервисе не задан
  server_url: string;
  domain: string | null;
  support_until: string;
};

function readme(c: TransferContent): string[] {
  return [
    `# Сайт онлайн-записи: ${c.business_name}`,
    '',
    'Этот файл содержит несколько разделов. Сохраните каждый раздел «=== ИМЯ ===» в файл с этим именем',
    '(строки между заголовками, без самого заголовка).',
    '',
    '## Что внутри',
    '- README.md — этот обзор.',
    '- INSTALL.md — порядок установки и запуска.',
    '- MIGRATIONS.md — какие SQL-файлы выполнить в Supabase и в каком порядке.',
    '- .env.example — шаблон настроек с данными вашей лицензии.',
    '',
    '## Лицензия',
    `Номер лицензии: ${c.license_id}`,
    c.domain ? `Домен: ${c.domain}` : 'Домен привяжется автоматически при первом запуске на вашем домене.',
    'Ключ лицензии находится в разделе .env.example (LICENSE_HMAC_SECRET). Не публикуйте его и не коммитьте в git.',
    'Сайт раз в сутки сверяет лицензию с сервером. Если сервер недоступен, сайт продолжает работать 7 дней.',
    '',
    '## Поддержка',
    `Поддержка: ${SUPPORT_DAYS} дней, до ${c.support_until}. До этой даты сайт работает и на нашей инфраструктуре.`,
    `После ${c.support_until} на нашей стороне будет заглушка «Сервис перенесён» — переключите домен на свою копию заранее.`,
    'Исходный код передаётся доступом к репозиторию (см. INSTALL.md, шаг 1).',
  ];
}

function install(): string[] {
  return [
    '# Установка',
    '',
    '1. Получите доступ к репозиторию с исходным кодом (ссылку присылает поддержка) и склонируйте его.',
    '2. Создайте проект Supabase. Выполните миграции по порядку из MIGRATIONS.md (SQL Editor).',
    '3. Создайте в Supabase Storage приватный bucket backups и публичный bucket photos.',
    '4. Скопируйте раздел .env.example в файл .env.local. Заполните пустые значения:',
    '   ключи Supabase (Settings → API), ENCRYPTION_KEY (openssl rand -hex 32), CRON_SECRET (openssl rand -hex 24).',
    '   SUPERADMIN_EMAILS оставьте пустым — супер-админка в вашей копии не используется.',
    '5. pnpm install, затем pnpm build — сборка должна пройти без ошибок.',
    '6. Деплой: Vercel → Import project → добавьте переменные из .env.local → Deploy. Привяжите свой домен.',
    '7. Создайте владельца в Supabase Auth (Authentication → Users) и добавьте строку в admin_users.',
    '8. Откройте сайт на своём домене: лицензия активируется при первом запросе.',
  ];
}

function migrations(): string[] {
  return ['# Миграции (выполнять строго по порядку в Supabase SQL Editor)', '', ...MIGRATION_FILES.map((f, i) => `${i + 1}. ${f}`)];
}

function envExample(c: TransferContent): string[] {
  return [
    '# Лицензия — персональные значения, не публикуйте',
    `LICENSE_ID=${c.license_id}`,
    `LICENSE_SERVER_URL=${c.server_url}`,
    `LICENSE_HMAC_SECRET=${c.license_key ?? ''}`,
    '',
    '# Supabase',
    'NEXT_PUBLIC_SUPABASE_URL=',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY=',
    'SUPABASE_SERVICE_ROLE_KEY=',
    '',
    '# Безопасность',
    'ENCRYPTION_KEY=',
    'CRON_SECRET=',
    '',
    '# Адрес вашего сайта',
    `NEXT_PUBLIC_SITE_URL=${c.domain ? `https://${c.domain}` : ''}`,
    'SINGLE_TENANT=true',
  ];
}

export function buildTransferText(c: TransferContent): string {
  const sections: [string, string[]][] = [
    ['README.md', readme(c)],
    ['INSTALL.md', install()],
    ['MIGRATIONS.md', migrations()],
    ['.env.example', envExample(c)],
  ];
  return sections.map(([name, lines]) => `=== ${name} ===\n${lines.join('\n')}\n`).join('\n');
}

// Разбор обратно в файлы — для тестов и для скрипта клиента. Возвращает имя → содержимое.
export function splitTransferText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let current: string | null = null;
  const buf: string[] = [];
  const flush = () => { if (current) out[current] = buf.join('\n').replace(/\n+$/, '\n'); };
  for (const line of text.split('\n')) {
    const m = SECTION_RE.exec(line);
    if (!m) { buf.push(line); continue; }
    flush();
    current = m[1];
    buf.length = 0;
  }
  flush();
  return out;
}

// ---------- Обработчик ----------

export async function handleTransfer(
  id: string,
  deps: { store: TransferStore; master_secret: string | null; server_url: string; now?: Date },
): Promise<TransferResult> {
  if (!UUID_RE.test(id)) return { ok: false, http_status: 400, reason: 'bad_id' };
  const b = await deps.store.findBusiness(id);
  if (!b) return { ok: false, http_status: 404, reason: 'not_found' };
  if (!TRANSFER_STATUSES.has(b.status)) return { ok: false, http_status: 409, reason: 'not_client' };

  const license_id = await deps.store.ensureLicense(b);
  if (!license_id) return { ok: false, http_status: 500, reason: 'license' };

  const first_time = !b.code_transferred_at;
  let support_until = b.support_until ?? '';
  if (first_time) {
    const at = (deps.now ?? new Date()).toISOString();
    const marked = await deps.store.markTransferred(b.id, at, addDays(at, SUPPORT_DAYS));
    if (!marked) return { ok: false, http_status: 500, reason: 'db' };
    support_until = marked.support_until;
  }
  await deps.store.audit(b.id, { first_time, support_until, license: `${license_id.slice(0, 8)}…` });

  const license_key = deps.master_secret ? await deriveLicenseKey(deps.master_secret, license_id) : null;
  const text = buildTransferText({
    business_name: b.name,
    license_id,
    license_key,
    server_url: deps.server_url,
    domain: b.custom_domain,
    support_until,
  });
  return { ok: true, file_name: transferFileName(b.slug), text, first_time };
}

// ---------- Реализация хранилища на Supabase ----------

export function supabaseTransferStore(): TransferStore {
  const db = adminClient();
  return {
    async findBusiness(id) {
      const { data, error } = await db.from('businesses')
        .select('id, name, slug, status, custom_domain, license_id, code_transferred_at, support_until').eq('id', id).maybeSingle();
      if (error) throw new Error(`businesses: ${error.message}`);
      return data;
    },
    async ensureLicense(b) {
      if (b.license_id) return b.license_id;
      // Лицензия могла быть создана в /panel/licenses без записи в businesses.license_id.
      const { data: found } = await db.from('licenses').select('license_id').eq('business_id', b.id).limit(1);
      let license_id: string | null = found?.[0]?.license_id ?? null;
      if (!license_id) {
        const { data: lic, error } = await db.from('licenses')
          .insert({ business_id: b.id, domain: b.custom_domain ?? UNBOUND_DOMAIN, allowed_domains: b.custom_domain ? [b.custom_domain] : [] })
          .select('license_id').single();
        if (error || !lic) return null;
        license_id = String(lic.license_id);
      }
      await db.from('businesses').update({ license_id }).eq('id', b.id).is('license_id', null);
      return license_id;
    },
    async markTransferred(id, at, support_until) {
      // Условие is(null) защищает от гонки двух одновременных скачиваний: дату ставит только первое.
      const { error: upd } = await db.from('businesses').update({ code_transferred_at: at, support_until }).eq('id', id).is('code_transferred_at', null);
      if (upd) return null; // без отметки передачи файл не отдаём: иначе срок поддержки не зафиксирован
      const { data } = await db.from('businesses').select('code_transferred_at, support_until').eq('id', id).maybeSingle();
      return data?.code_transferred_at && data.support_until ? { code_transferred_at: data.code_transferred_at, support_until: data.support_until } : null;
    },
    async audit(business_id, payload) {
      await audit('code_transfer', 'business', business_id, payload);
    },
  };
}
