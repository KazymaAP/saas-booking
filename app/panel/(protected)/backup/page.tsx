// app/panel/(protected)/backup/page.tsx — резервные копии: список, скачивание, ручной запуск, восстановление (ТЗ §35, §5.4 /panel/backup).
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { SITE_URL } from '@/lib/site';
import { RestoreForm } from './RestoreForm';

export const dynamic = 'force-dynamic';

async function runBackup() {
  'use server';
  const site = SITE_URL;
  await fetch(`${site}/api/cron/backup`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, cache: 'no-store' });
  revalidatePath('/panel/backup');
}

export default async function BackupPage() {
  const { data: files } = await adminClient().storage.from('backups').list('', { limit: 50, sortBy: { column: 'name', order: 'desc' } });
  const items = (files ?? []).filter((f) => f.name.endsWith('.json')).slice(0, 20);
  const links = await Promise.all(items.map(async (f) => {
    const { data } = await adminClient().storage.from('backups').createSignedUrl(f.name, 300);
    return { name: f.name, url: data?.signedUrl ?? null, size: (f.metadata as { size?: number } | null)?.size };
  }));

  return (
    <div className="grid max-w-[640px] gap-6">
      <h1 className="text-[24px] font-semibold">Резервные копии</h1>
      <p className="text-[14px] text-[#666666]">Автоматически раз в неделю (воскресенье). JSON ключевых таблиц. Ссылки действуют 5 минут.</p>
      <form action={runBackup}><button type="submit" className="btn-primary">Сделать копию сейчас</button></form>
      <ul className="grid gap-4 text-[14px]">
        {links.map((l) => (
          <li key={l.name} className="grid gap-2 rounded-md border border-[#e5e5e5] p-3">
            <div className="flex justify-between gap-3">
              <span>{l.name} {l.size ? `· ${(Number(l.size) / 1024).toFixed(0)} КБ` : ''}</span>
              {l.url && <a className="underline" href={l.url}>Скачать</a>}
            </div>
            <RestoreForm file={l.name} />
          </li>
        ))}
        {links.length === 0 && <li className="text-[#666666]">Копий пока нет.</li>}
      </ul>
      <p className="text-[14px] text-[#666666]">Проверка восстановления — раз в месяц на тестовом проекте (§35).</p>
    </div>
  );
}
