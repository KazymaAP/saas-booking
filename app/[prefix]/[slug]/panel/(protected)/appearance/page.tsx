// app/[prefix]/[slug]/panel/(protected)/appearance/page.tsx — отдельный раздел «Оформление».
// Только владелец: стиль кабинета и стиль сайта меняются независимо.
// Раньше этот блок был внизу «Настроек», теперь у него свой пункт меню.
import Link from 'next/link';
import { OWNER_ONLY, requirePageAccess } from '../_lib/access';
import { panelBase } from '../_lib/sections';
import { AppearancePicker } from './AppearancePicker';
import { AUTO_KEY, PANEL_THEME_KEY, SITE_THEME_KEY } from '@/lib/appearance';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Оформление', robots: { index: false, follow: false } };

export default async function AppearancePage({ params }: { params: { prefix: string; slug: string } }) {
  const { business } = await requirePageAccess(params, OWNER_ONLY);
  const texts = (business.custom_texts ?? {}) as Record<string, string>;
  const base = panelBase(params);

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="!mb-1">Оформление</h1>
          <p className="!mb-0 text-[14px] text-[var(--muted)]">
            Стиль кабинета и сайта-визитки меняются отдельно. По умолчанию — оформление вашей ниши.
          </p>
        </div>
        <Link
          href={`/${params.prefix}/${params.slug}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[40px] items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 !no-underline"
        >
          Посмотреть сайт ↗
        </Link>
      </header>

      <AppearancePicker
        slug={params.slug}
        panelTheme={texts[PANEL_THEME_KEY] ?? AUTO_KEY}
        siteTheme={texts[SITE_THEME_KEY] ?? AUTO_KEY}
      />

      <p className="!mb-0 text-[13px] text-[var(--muted)]">
        Контакты, рабочее время и правила записи остаются в разделе{' '}
        <Link href={`${base}/settings`} className="underline">Настройки</Link>.
      </p>
    </div>
  );
}
