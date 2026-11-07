// app/[prefix]/[slug]/panel/(protected)/settings/page.tsx — настройки бизнеса (ТЗ §4.6, §5.3).
// Только владелец: менеджер получает 404 (requirePageAccess), а action проверяет роль ещё раз.
import Link from 'next/link';
import { OWNER_ONLY, requirePageAccess } from '../_lib/access';
import { panelBase } from '../_lib/sections';
import { toSettingsForm } from './schema';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: { prefix: string; slug: string } }) {
  const { business } = await requirePageAccess(params, OWNER_ONLY);
  return (
    <div className="grid gap-4">
      <header>
        <h1 className="!mb-1">Настройки</h1>
        <p className="!mb-0 text-[14px] text-[#595959]">Контакты, рабочее время и правила записи. Изменения сразу появляются на сайте.</p>
      </header>
      {/* После сохранения форма сама делает reset(values): свежие значения уже в ней, перезагрузка не нужна. */}
      <SettingsForm slug={params.slug} defaults={toSettingsForm(business)} />
      <p className="!mb-0 text-[13px] text-[var(--muted)]">
        Цвета и шрифты кабинета и сайта настраиваются в отдельном разделе{' '}
        <Link href={`${panelBase(params)}/appearance`} className="underline">Оформление →</Link>
      </p>
    </div>
  );
}
