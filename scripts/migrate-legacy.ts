// scripts/migrate-legacy.ts — миграция legacy-клиентов из CSV (ТЗ §53). Колонки: slug,name,city,phone,email,subscription_until,old_domain,new_url
// Существующие бизнесы обновляются по slug, новые создаются со статусом client. old_domain → legacy_redirects.
// Запуск: npx tsx scripts/migrate-legacy.ts path/to/legacy.csv [--dry-run]
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { normalizePhone } from '../lib/phone';
import { slugify } from '../lib/slug';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const file = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!file) {
  console.error('Укажите CSV-файл');
  process.exit(1);
}

function parseCsv(text: string): Record<string, string>[] {
  const [head, ...lines] = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const cols = head.split(',').map((c) => c.trim());
  return lines.map((l) => {
    const cells = l.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? '').trim()]));
  });
}

async function main() {
  const rows = parseCsv(readFileSync(file, 'utf8'));
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: tpl } = await db.from('vertical_templates').select('id').eq('slug', 'tire-service').maybeSingle();
  const stats = { updated: 0, created: 0, redirects: 0, skipped: 0 };

  for (const r of rows) {
    const name = r.name;
    if (!name) { stats.skipped++; continue; }
    const slug = r.slug || slugify(name);
    const phone = normalizePhone(r.phone ?? '');
    const payload = {
      name,
      city: r.city || null,
      phones: phone ? [phone] : [],
      emails: r.email ? [r.email.toLowerCase()] : [],
      status: 'client',
      subscription_active: Boolean(r.subscription_until),
      subscription_until: r.subscription_until || null,
    };
    if (!dryRun) {
      const { data: existing } = await db.from('businesses').select('id').eq('slug', slug).maybeSingle();
      if (existing) {
        await db.from('businesses').update(payload).eq('id', existing.id);
        stats.updated++;
      } else {
        await db.from('businesses').insert({ slug, vertical_template_id: tpl?.id ?? null, ...payload });
        stats.created++;
      }
      if (r.old_domain && r.new_url) {
        await db.from('legacy_redirects').upsert({ from_domain: r.old_domain.toLowerCase(), to_url: r.new_url });
        stats.redirects++;
      }
    } else {
      stats.created++;
    }
  }
  console.log(dryRun ? 'dry-run:' : 'Готово:', stats);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
