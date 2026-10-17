// app/panel/(protected)/backup/page.tsx — резервные копии (ТЗ 4.0 §16.7, §5.4 /panel/backup):
// список, скачивание по signed URL (TTL 300 с), ручной запуск, восстановление с подтверждением.
// Доступ к странице — layout супер-админки (агент 7); действия дополнительно проверяют isSuperAdmin сами.
import { BACKUP_RETENTION_DAYS, BACKUP_TABLES, SIGNED_URL_TTL_S, listBackups, supabaseBackupDb, type BackupListItem } from '@/lib/backup';
import { backupFileDate } from '@/lib/backup-shared';
import { BackupNowButton } from './BackupNowButton';
import { RestoreForm } from './RestoreForm';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // server action «Сделать копию сейчас» выполняется в рамках этой страницы

const KB = 1_024;
const LINK_TTL_MIN = Math.round(SIGNED_URL_TTL_S / 60);

function fileDateRu(name: string): string {
  return backupFileDate(name).toLocaleDateString('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

function sizeText(size: number | null): string {
  return size === null ? '' : ` · ${Math.max(1, Math.round(size / KB))} КБ`;
}

function BackupItem({ item }: { item: BackupListItem }) {
  return (
    <li className="grid gap-2 rounded-md border border-[#e5e5e5] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          <span className="font-medium">{fileDateRu(item.name)}</span>
          <span className="text-[#666666]"> — {item.name}{sizeText(item.size)}</span>
        </span>
        {item.url ? (
          <a className="underline" href={item.url} download={item.name} aria-label={`Скачать копию за ${fileDateRu(item.name)}`}>
            Скачать
          </a>
        ) : (
          <span className="text-[#666666]">Ссылка недоступна</span>
        )}
      </div>
      <RestoreForm file={item.name} />
    </li>
  );
}

export default async function BackupPage() {
  const { items, error } = await listBackups(supabaseBackupDb());

  return (
    <div className="grid max-w-[720px] gap-6">
      <h1 className="text-[24px] font-semibold">Резервные копии</h1>
      <p className="text-[14px] text-[#666666]">
        Автоматически каждый день в 03:00 UTC: JSON {BACKUP_TABLES.length} таблиц ({BACKUP_TABLES.join(', ')}).
        Хранятся {BACKUP_RETENTION_DAYS} дней, последняя копия не удаляется. Ссылки на скачивание действуют {LINK_TTL_MIN} минут —
        обновите страницу, если ссылка истекла. Еженедельно дополнительно делается полный pg_dump (GitHub Actions).
      </p>
      <BackupNowButton />
      <section aria-labelledby="backup-list-title" className="grid gap-3">
        <h2 id="backup-list-title" className="text-[18px] font-semibold">Копии ({items.length})</h2>
        {error && <p role="alert" className="text-[14px] text-[#dc2626]">Не удалось получить список копий: {error.slice(0, 200)}</p>}
        <ul className="grid gap-4 text-[14px]">
          {items.map((item) => <BackupItem key={item.name} item={item} />)}
          {items.length === 0 && !error && <li className="text-[#666666]">Копий пока нет.</li>}
        </ul>
      </section>
      <section aria-labelledby="restore-check-title" className="grid gap-2 text-[14px] text-[#666666]">
        <h2 id="restore-check-title" className="text-[16px] font-semibold text-[#111111]">Чек-лист проверки восстановления (раз в месяц)</h2>
        <ol className="list-decimal pl-5">
          <li>Создайте тестовый проект Supabase и выполните миграции supabase/migrations по порядку.</li>
          <li>Скачайте свежую копию и восстановите её в тестовом проекте (те же переменные окружения, другой URL).</li>
          <li>Сверьте количество строк в отчёте с числами в файле копии (поле counts). Контрольная сумма (поле checksum)
            проверяется автоматически: изменённый или обрезанный файл восстановлен не будет.</li>
          <li>Откройте 2–3 сайта бизнесов и кабинет владельца на тестовом проекте, проверьте брони и фото.</li>
          <li>Запишите дату проверки в журнал. Удалите тестовый проект.</li>
        </ol>
      </section>
    </div>
  );
}
