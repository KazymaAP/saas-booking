// app/api/transfer/[id]/route.ts — передача кода клиенту: ZIP с инструкцией и лицензией (ТЗ §5.9, §5.8). Только супер-админ.
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import archiver from 'archiver';
import { isSuperAdmin } from '@/lib/admin-session';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DAY = 86_400_000;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await isSuperAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ ok: false }, { status: 400 });

  const db = adminClient();
  const { data: b } = await db.from('businesses').select('*').eq('id', params.id).maybeSingle();
  if (!b || b.status !== 'client') return NextResponse.json({ ok: false, reason: 'not_client' }, { status: 409 });

  // Лицензия: создаём, если её ещё нет
  let licenseId = b.license_id as string | null;
  if (!licenseId) {
    const { data: lic } = await db.from('licenses')
      .insert({ business_id: b.id, domain: b.custom_domain ?? 'не указан', allowed_domains: b.custom_domain ? [b.custom_domain] : [] })
      .select('license_id').single();
    licenseId = lic?.license_id ?? randomUUID();
    await db.from('businesses').update({ license_id: licenseId }).eq('id', b.id);
  }

  const supportUntil = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
  await db.from('businesses').update({ code_transferred_at: new Date().toISOString(), support_until: supportUntil }).eq('id', b.id);
  await audit('code_transfer', 'business', b.id, { support_until: supportUntil });

  const readme = [
    `# Сайт онлайн-записи: ${b.name}`,
    '',
    '## Что внутри',
    '- .env.example — шаблон настроек. Скопируйте в .env.local и заполните.',
    '- INSTALL.md — порядок запуска.',
    '- MIGRATIONS.md — какие SQL-файлы выполнить в Supabase.',
    '',
    '## Лицензия',
    `LICENSE_ID=${licenseId}`,
    'LICENSE_SERVER_URL=<адрес сервиса>',
    '',
    `Поддержка: 30 дней, до ${supportUntil}. После этого сайт перестаёт работать на нашей инфраструктуре.`,
    'Исходный код передаётся отдельным архивом репозитория (см. INSTALL.md).',
  ].join('\n');

  const install = [
    '# Установка',
    '',
    '1. Создайте проект Supabase, выполните миграции по порядку (MIGRATIONS.md).',
    '2. Скопируйте .env.example в .env.local, заполните ключи Supabase, ENCRYPTION_KEY, CRON_SECRET, SUPERADMIN_EMAILS (не нужен клиенту — оставьте пустым).',
    '3. pnpm install, pnpm build.',
    '4. Деплой на Vercel (Pro), привяжите домен, задайте переменные окружения.',
    '5. Создайте владельца через админку или вручную в Supabase Auth и добавьте в admin_users.',
  ].join('\n');

  const migrations = [
    '# Миграции (выполнять по порядку в Supabase SQL Editor)',
    '',
    '1. supabase/migrations/0001_init.sql',
    '2. supabase/migrations/0002_lifecycle.sql',
  ].join('\n');

  const envExample = [
    `LICENSE_ID=${licenseId}`,
    'LICENSE_SERVER_URL=',
    'NEXT_PUBLIC_SUPABASE_URL=',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY=',
    'SUPABASE_SERVICE_ROLE_KEY=',
    'ENCRYPTION_KEY=',
    'CRON_SECRET=',
    'NEXT_PUBLIC_SITE_URL=',
  ].join('\n');

  const zip = archiver('zip', { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  zip.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    zip.on('end', () => resolve());
    zip.on('error', reject);
  });
  zip.append(readme, { name: 'README.md' });
  zip.append(install, { name: 'INSTALL.md' });
  zip.append(migrations, { name: 'MIGRATIONS.md' });
  zip.append(envExample, { name: '.env.example' });
  await zip.finalize();
  await done;

  const body = Buffer.concat(chunks);
  const fileName = `transfer-${b.slug}-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
