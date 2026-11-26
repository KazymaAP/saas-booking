// app/test/ful/sts/catalog.ts — единый список страниц раздела копий.
// Используется и оглавлением (page.tsx), и текстовым списком адресов (urls/route.ts),
// чтобы они не разъезжались.
import { demoEnabled } from '@/lib/demo-gate';
import { adminClient } from '@/lib/supabase';

// demo — страница существует только при DEMO_ENABLED=1 (см. lib/demo-gate.ts).
export type PageLink = { readonly path: string; readonly label: string; readonly demo?: boolean };

export type Service = {
  readonly slug: string;
  readonly name: string;
  readonly status: string;
  readonly prefix: string;
};

type BusinessRow = {
  readonly slug: string;
  readonly name: string;
  readonly status: string;
  readonly vertical_template_id: string | null;
};

type TemplateRow = { readonly id: string; readonly url_prefix: string | null };

// Разделы кабинета сервиса — ровно те, что в меню кабинета.
export const CABINET_SECTIONS: readonly PageLink[] = [
  { path: 'bookings', label: 'Брони' },
  { path: 'services', label: 'Услуги' },
  { path: 'photos', label: 'Фото' },
  { path: 'texts', label: 'Тексты' },
  { path: 'reviews', label: 'Отзывы' },
  { path: 'staff', label: 'Сотрудники' },
  { path: 'faq', label: 'Вопросы' },
  { path: 'notifications', label: 'Уведомления' },
  { path: 'settings', label: 'Настройки' },
  { path: 'appearance', label: 'Оформление' },
  { path: 'subscription', label: 'Подписка' },
  { path: 'team', label: 'Команда' },
  { path: 'data', label: 'Данные' },
];

// Публичные страницы платформы.
// Флаг demo стоит у тех, что открываются только при DEMO_ENABLED=1: без него они отдают
// 404, а справочник адресов нужен ровно для того, чтобы каждая ссылка открывалась.
const PUBLIC_PAGES_ALL: readonly PageLink[] = [
  { path: '/', label: 'Главная' },
  { path: '/demo', label: 'Демо', demo: true },
  { path: '/demo/business', label: 'Демо бизнеса', demo: true },
  { path: '/oferta', label: 'Оферта' },
  { path: '/privacy', label: 'Политика конфиденциальности' },
  { path: '/data-request', label: 'Запрос данных' },
  { path: '/dogovor-porucheniya', label: 'Договор поручения' },
  { path: '/partner', label: 'Партнёрам' },
  { path: '/partner/demo', label: 'Партнёрам — демо', demo: true },
  { path: '/partner/login', label: 'Партнёрам — вход' },
  { path: '/auth', label: 'Вход' },
  { path: '/magic-link', label: 'Вход по ссылке' },
  { path: '/reset-password', label: 'Сброс пароля' },
  { path: '/blocked', label: 'Блокировка' },
];

/** Публичные страницы, которые действительно открываются в текущем окружении. */
export function publicPages(): readonly PageLink[] {
  return demoEnabled() ? PUBLIC_PAGES_ALL : PUBLIC_PAGES_ALL.filter((p) => !p.demo);
}

// Студия супер-админа.
export const SUPERADMIN_PAGES: readonly PageLink[] = [
  { path: '/admin', label: 'Главная студии' },
  { path: '/admin/businesses', label: 'Бизнесы' },
  { path: '/admin/clients', label: 'Клиенты' },
  { path: '/admin/email-accounts', label: 'Почтовые аккаунты' },
  { path: '/admin/funnel', label: 'Воронка' },
  { path: '/admin/inbox', label: 'Входящие' },
  { path: '/admin/licenses', label: 'Лицензии' },
  { path: '/admin/logs', label: 'Журнал' },
  { path: '/admin/settings', label: 'Настройки' },
  { path: '/admin/stats', label: 'Статистика' },
  { path: '/admin/templates', label: 'Шаблоны' },
  { path: '/admin/verticals', label: 'Ниши' },
  { path: '/admin/backup', label: 'Бэкап' },
  { path: '/admin/preview/tenant', label: 'Предпросмотр тенанта' },
  { path: '/admin/login', label: 'Вход в студию' },
  { path: '/admin/forgot-password', label: 'Восстановление пароля' },
  { path: '/GERA', label: 'Таблица GERA' },
  { path: '/dev/super-admin', label: 'Dev: супер-админ' },
];

// Список сервисов из базы. Сбой базы не роняет страницу: отдаём пустой список,
// вызывающий код всё равно покажет статические разделы.
//
// Только status='client': публичный сайт открывается лишь у опубликованных сервисов,
// а в базе лежат ещё архивные строки (сидовые glowdetailing и lyubava). Раньше они попадали
// в справочник и давали восемь ссылок на 404 — в том числе в текстовом списке адресов.
export async function loadServices(): Promise<Service[]> {
  // try/catch обязателен: adminClient() бросает EnvError СИНХРОННО, до первого запроса.
  // Без него `.catch()` ниже не срабатывает, и при сборке без переменных окружения
  // (например, на Vercel с ненастроенным проектом) падает предрендер всей страницы,
  // а вместе с ним и весь билд. Пустой список — правильное поведение: разделы оглавления
  // статические, от базы зависит только список сервисов.
  try {
    const db = adminClient();
    const [{ data: businesses }, { data: templates }] = await Promise.all([
      db.from('businesses').select('slug, name, status, vertical_template_id').eq('status', 'client').order('name'),
      db.from('vertical_templates').select('id, url_prefix'),
    ]).catch(() => [{ data: [] }, { data: [] }] as const);

    const prefixById = new Map<string, string>();
    for (const t of (templates ?? []) as TemplateRow[]) {
      if (t.url_prefix) prefixById.set(t.id, t.url_prefix);
    }

    return ((businesses ?? []) as BusinessRow[]).map((b) => ({
      slug: b.slug,
      name: b.name,
      status: b.status,
      prefix: (b.vertical_template_id ? prefixById.get(b.vertical_template_id) : null) ?? 'd',
    }));
  } catch {
    return [];
  }
}

// Все пути сервиса: сайт, кабинет с разделами, клиентский кабинет и смены по ролям.
export function servicePaths(service: Service, roles: readonly string[]): string[] {
  const base = `/${service.prefix}/${service.slug}`;
  return [
    base,
    `${base}/admin`,
    ...CABINET_SECTIONS.map((s) => `${base}/admin/${s.path}`),
    `${base}/my`,
    `${base}/my/login`,
    ...roles.map((r) => `${base}/${r}`),
  ];
}

// Полный список путей раздела: публичные, студия и все сервисы.
export function allPaths(services: readonly Service[], roles: readonly string[]): string[] {
  return [
    ...publicPages().map((p) => p.path),
    ...SUPERADMIN_PAGES.map((p) => p.path),
    ...services.flatMap((s) => servicePaths(s, roles)),
  ];
}
