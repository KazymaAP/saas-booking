// next.config.mjs — настройки Next 14.2 (ТЗ §2, §17.1).
// Единый источник статических security headers: headers() применяется ко всем ответам,
// включая _next/static и пути вне matcher middleware. Middleware ставит только динамические заголовки.

const is_dev = process.env.NODE_ENV === 'development';

// Год в секундах (ТЗ §17.1: HSTS max-age=31536000).
const HSTS_MAX_AGE = 31_536_000;

// CSP (ТЗ §17.1 + расширения, обоснование в notes.md):
// - script-src 'unsafe-inline': Next 14 вставляет inline-скрипты гидрации; nonce потребовал бы динамического
//   рендера всех страниц и убил бы ISR публичных сайтов (revalidate = 60).
// - 'unsafe-eval' только в `next dev` (React Refresh). В production его нет.
// - img-src https:: логотипы берутся из og:image сайтов клиентов (домены заранее неизвестны), плитки OSM.
// CSP собирается функцией, а не константой: origin Supabase берётся из env в момент вызова headers().
// Так конфиг тестируется (общие/lib/security-headers.test.ts) и не зависит от порядка загрузки env.
function buildSecurityHeaders() {
  // Origin Supabase нужен в connect-src: браузер сам заливает фото по подписанной ссылке
  // в Storage (PUT на <project>.supabase.co). Без него CSP блокировала загрузку — фото не доходили,
  // интерфейс показывал «Загружено 0 из 1».
  const supabaseOrigin = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
    } catch {
      return '';
    }
  })();
  const supabaseWs = supabaseOrigin ? supabaseOrigin.replace(/^https:/, 'wss:') : '';
  const connectSrc = ["'self'", supabaseOrigin, supabaseWs, is_dev ? 'ws:' : ''].filter(Boolean).join(' ');

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${is_dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(is_dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'Strict-Transport-Security', value: `max-age=${HSTS_MAX_AGE}; includeSubDomains` },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // geolocation=(): по ТЗ §17.1 (строже промта), геолокация в коде не используется.
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
    // Изоляция окна от чужих вкладок (tabnabbing, XS-Leaks). Popup/OAuth не используются; внешние ссылки — rel=noreferrer.
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    // Запрет Flash/PDF-плагинам читать кросс-доменные политики.
    { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Сжатие (gzip/brotli) на встроенном сервере next start. На Vercel этим занимается CDN, но для
  // самостоятельного хостинга явное включение режет вес HTML/JSON/JS в 3-4 раза.
  compress: true,
  // distDir можно вынести через NEXT_DIST_DIR (по умолчанию '.next').
  // В песочнице запись в project/.next блокируется (safe-delete + EPERM на .next/trace),
  // поэтому сборку/запуск делаем с NEXT_DIST_DIR вне проекта.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    // next/image используется только для фото из Supabase Storage.
    // Логотипы (data:image/svg+xml и og:image с произвольных доменов) выводятся через <img> — без оптимизатора.
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
    formats: ['image/avif', 'image/webp'],
    // Мобильно-ориентированный набор: основной трафик записи — с телефонов.
    // Убрали 2048/3840 (никогда не нужны на витрине), добавили 360/414 для бюджетных аппаратов.
    deviceSizes: [360, 414, 640, 750, 828, 1080, 1200, 1920],
    // Оптимизированные версии фото кэшируются на сутки: фото меняются редко, URL уникален.
    minimumCacheTTL: 86_400,
    dangerouslyAllowSVG: false,
  },
  experimental: {
    // Тяжёлые Node-пакеты не бандлятся в серверный код, а подключаются из node_modules.
    serverComponentsExternalPackages: ['imapflow', 'nodemailer', 'archiver', 'xlsx'],
    // Импорт только используемых иконок вместо всего пакета.
    optimizePackageImports: ['@phosphor-icons/react', 'leaflet'],
    // Проверка обязательных env при старте сервера (instrumentation.ts).
    instrumentationHook: true,
    // Клиентский кэш переходов: возврат назад в панели мгновенный, данные свежие не дольше 30 секунд.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  async headers() {
    // Cache-Control и Service-Worker-Allowed для /sw.js ставит сам route handler (app/sw.js/route.ts).
    return [{ source: '/:path*', headers: buildSecurityHeaders() }];
  },
};

export default nextConfig;
