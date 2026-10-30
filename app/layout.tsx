// app/layout.tsx — корневой макет: глобальные metadata и viewport (ТЗ §12.2).
// brand_color передаётся через CSS-переменную --brand-color (ТЗ §47). Стили body — только в globals.css.
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { SITE_URL } from '@/lib/site';
import './globals.css';

const SITE_NAME = 'Онлайн-запись';

// Supabase (API + Storage с фото бизнесов) — один origin для всех запросов сайта.
// preconnect/dns-prefetch ускоряет первый сетевой шаг на любой странице (ТЗ §5.1 perf).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';


export const metadata: Metadata = {
  // Относительные og:image/canonical разворачиваются от основного домена.
  metadataBase: new URL(SITE_URL),
  // Без title.template: у сайтов клиентов заголовок — только название бизнеса, без бренда сервиса.
  title: SITE_NAME,
  description: 'Сайт онлайн-записи для вашего бизнеса: клиенты записываются с телефона без звонков.',
  applicationName: SITE_NAME,
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: { type: 'website', locale: 'ru_RU', siteName: SITE_NAME },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Масштабирование не запрещаем (доступность).
  themeColor: '#ffffff',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        {SUPABASE_URL ? (
          <>
            <link rel="preconnect" href={SUPABASE_URL} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={SUPABASE_URL} />
          </>
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
