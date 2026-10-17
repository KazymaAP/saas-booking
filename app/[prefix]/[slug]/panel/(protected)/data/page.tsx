// app/[prefix]/[slug]/panel/(protected)/data/page.tsx — данные бизнеса: выгрузка CSV и удаление аккаунта (ТЗ §32).
// Серверный, данные — из currentOwner (кэш запроса), своих запросов к БД нет. Только владелец: CSV содержит ПД клиентов.
import { OWNER_ONLY, requirePageAccess } from '../_lib/access';
import { panelBase } from '../_lib/sections';
import { formatDate } from '../_lib/time';
import { DELETION_GRACE_DAYS } from './rules';
import { DeleteAccount } from './DeleteAccount';

export const dynamic = 'force-dynamic';

export default async function DataPage({ params }: { params: { prefix: string; slug: string } }) {
  const { business: b } = await requirePageAccess(params, OWNER_ONLY);
  const scheduled = b.status === 'pending_deletion' && b.deletion_scheduled_at ? formatDate(b.deletion_scheduled_at) : null;

  return (
    <div className="grid max-w-[640px] gap-6">
      <h1 className="!mb-0">Данные</h1>

      <section aria-labelledby="data-export-title" className="grid gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4">
        <h2 id="data-export-title" className="!mb-0">Выгрузка броней</h2>
        <p className="!mb-0 text-[14px] text-[#595959]">
          Файл CSV для Excel: дата, статус, клиент, телефон, email, услуга, цена, комментарий. Содержит персональные данные клиентов — не пересылайте его третьим лицам.
        </p>
        {/* Обычная ссылка (не Link): это скачивание файла, клиентская навигация и prefetch здесь не нужны. */}
        <a className="btn-primary w-full !min-h-[44px] sm:w-fit" href={`${panelBase(params)}/export`} download>
          Скачать CSV
        </a>
      </section>

      <section aria-labelledby="data-delete-title" className="grid gap-2 rounded-xl border border-[#fca5a5] bg-white p-4">
        <h2 id="data-delete-title" className="!mb-0">Удаление аккаунта</h2>
        {b.status === 'pending_deletion' ? (
          <p role="status" className="!mb-0 text-[14px]">
            Запрос принят. Данные будут удалены{scheduled ? ` ${scheduled}` : ` через ${DELETION_GRACE_DAYS} дней`}.
            Чтобы отменить, напишите нам до этой даты.
          </p>
        ) : (
          <DeleteAccount slug={params.slug} siteSlug={b.slug} />
        )}
      </section>
    </div>
  );
}
