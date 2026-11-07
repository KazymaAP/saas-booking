// app/dev/templates/[key]/page.tsx — предпросмотр шаблона ниши на демо-данных.
// Нужен разделу «Шаблоны» в супер-админке: открывает любой из 10 дизайнов целиком.
// Доступ только супер-админу, индексация запрещена. Данные — демонстрационные.
//
// ВАЖНО: по умолчанию показываем NicheSite — ровно тот компонент, который видит клиент на
// /{prefix}/{slug}. Раньше здесь рендерился универсальный StudioTemplate, и оператор видел
// не тот дизайн, что у арендатора (?variant=universal — тот самый универсальный вариант).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isSuperAdmin } from '@/lib/admin-session';
import { ALL_NICHE_THEMES, getNicheThemeBySlug } from '@/шаблоны/_shared/themes';
import { NicheSite } from '@/шаблоны/_shared/NicheSite';
import { buildNicheTenant } from '@/шаблоны/_shared/niche-tenant';
import { StudioTemplate } from '@/components/templates/StudioTemplate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Предпросмотр шаблона',
};

type Theme = (typeof ALL_NICHE_THEMES)[number];

// Демо-услуги одинаковы по структуре, но подписаны под нишу.
function demoServices(theme: Theme) {
  const base = [
    { name: `Консультация · ${theme.businessNoun}`, price: 0, duration: 30 },
    { name: 'Базовая услуга', price: 2500, duration: 60 },
    { name: 'Расширенный пакет', price: 6500, duration: 120 },
    { name: 'Премиум-пакет', price: 12000, duration: 180 },
  ];
  return base.map((s, i) => ({
    id: `demo-${theme.key}-${i}`,
    name: s.name,
    description: '',
    price: s.price,
    duration_minutes: s.duration,
    is_active: true,
  }));
}

const DEMO_HOURS = {
  mon: [{ open: '10:00', close: '20:00' }],
  tue: [{ open: '10:00', close: '20:00' }],
  wed: [{ open: '10:00', close: '20:00' }],
  thu: [{ open: '10:00', close: '20:00' }],
  fri: [{ open: '10:00', close: '20:00' }],
  sat: [{ open: '11:00', close: '18:00' }],
  sun: null,
};

export default async function TemplatePreviewPage({
  params,
  searchParams,
}: {
  params: { key: string };
  searchParams?: { variant?: string };
}) {
  if (!(await isSuperAdmin())) redirect('/panel/login');

  const theme = getNicheThemeBySlug(params.key);
  if (!theme) notFound();

  const universal = searchParams?.variant === 'universal';
  const services = demoServices(theme);
  const photos = [{ url: `/media/covers/${theme.key}.svg`, alt: theme.tagline }];

  const business = {
    slug: `demo-${theme.key}`,
    name: `Демо · ${theme.tagline}`,
    description: theme.intro,
    address: 'ул. Примерная, 12',
    city: 'Москва',
    phones: ['+7 900 000-00-00'],
    emails: [],
    rating: 4.9,
    reviews_count: 128,
    logo_url: null,
    brand_color: theme.accent,
    working_hours: DEMO_HOURS,
    timezone: 'Europe/Moscow',
    lat: 55.7558,
    lng: 37.6173,
    socials: {},
    websites: [],
  };

  const switcher = (
    <div className="fixed left-3 top-3 z-[100] flex flex-wrap items-center gap-1.5 rounded-full border border-white/15 bg-black/80 px-2 py-1.5 text-[12px] text-white shadow-lg backdrop-blur">
      <Link
        href={`/dev/templates/${theme.key}`}
        className={`rounded-full px-2.5 py-1 ${universal ? 'text-white/70 hover:text-white' : 'bg-white text-black'}`}
      >
        Как у клиента
      </Link>
      <Link
        href={`/dev/templates/${theme.key}?variant=universal`}
        className={`rounded-full px-2.5 py-1 ${universal ? 'bg-white text-black' : 'text-white/70 hover:text-white'}`}
      >
        Универсальный
      </Link>
      <Link href="/admin" className="rounded-full px-2.5 py-1 text-white/70 hover:text-white">
        ← Админка
      </Link>
    </div>
  );

  if (universal) {
    return (
      <>
        {switcher}
        <StudioTemplate
          business={business}
          services={services}
          photos={photos}
          title={theme.tagline}
          subtitle={theme.intro}
          about={theme.intro}
          texts={{}}
          preview
        />
      </>
    );
  }

  // NicheSite ждёт полный Business — демо-объект покрывает только нужные поля.
  const tenant = buildNicheTenant(
    business as unknown as Parameters<typeof buildNicheTenant>[0],
    services as unknown as Parameters<typeof buildNicheTenant>[1],
    photos,
    {},
    theme,
  );

  return (
    <>
      {switcher}
      <NicheSite tenant={tenant} prefix={theme.prefix} slug={business.slug} />
    </>
  );
}
