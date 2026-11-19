// app/test/ful/sts/page.tsx — временный хаб копий: кнопки на все страницы сайта под /test/ful/sts.
//
// Страница только собирает ссылки. Сами копии — это те же маршруты приложения: middleware
// срезает префикс и рендерит оригинал, поэтому копия совпадает с оригиналом и по виду, и по работе.
//
// Удаление: убрать блок COPY_PREFIX в middleware.ts, папку app/test/ful и общие/lib/copy-mode*.
import type { Metadata } from 'next';

import { adminClient } from '@/lib/supabase';
import { STAFF_ROLES, ROLE_LABELS } from '@/lib/auth-roles';
import { COPY_PREFIX } from '@/lib/copy-mode-paths';
import { CopyIndex } from './CopyIndex';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Копии страниц — временный раздел',
  robots: { index: false, follow: false },
};

type BusinessRow = {
  readonly slug: string;
  readonly name: string;
  readonly status: string;
  readonly vertical_template_id: string | null;
};

type TemplateRow = { readonly id: string; readonly url_prefix: string | null };

// Разделы кабинета сервиса — ровно те, что в меню кабинета.
const CABINET_SECTIONS: readonly { readonly path: string; readonly label: string }[] = [
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
const PUBLIC_PAGES: readonly { readonly path: string; readonly label: string }[] = [
  { path: '/', label: 'Главная' },
  { path: '/demo', label: 'Демо' },
  { path: '/demo/business', label: 'Демо бизнеса' },
  { path: '/oferta', label: 'Оферта' },
  { path: '/privacy', label: 'Политика конфиденциальности' },
  { path: '/data-request', label: 'Запрос данных' },
  { path: '/dogovor-porucheniya', label: 'Договор поручения' },
  { path: '/partner', label: 'Партнёрам' },
  { path: '/partner/demo', label: 'Партнёрам — демо' },
  { path: '/partner/login', label: 'Партнёрам — вход' },
  { path: '/auth', label: 'Вход' },
  { path: '/magic-link', label: 'Вход по ссылке' },
  { path: '/reset-password', label: 'Сброс пароля' },
  { path: '/blocked', label: 'Блокировка' },
];

// Студия супер-админа.
const SUPERADMIN_PAGES: readonly { readonly path: string; readonly label: string }[] = [
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

export default async function CopyIndexPage() {
  const db = adminClient();
  const [{ data: businesses }, { data: templates }] = await Promise.all([
    db.from('businesses').select('slug, name, status, vertical_template_id').order('name'),
    db.from('vertical_templates').select('id, url_prefix'),
  ]);

  const prefixById = new Map<string, string>();
  for (const t of (templates ?? []) as TemplateRow[]) {
    if (t.url_prefix) prefixById.set(t.id, t.url_prefix);
  }

  const services = ((businesses ?? []) as BusinessRow[]).map((b) => ({
    slug: b.slug,
    name: b.name,
    status: b.status,
    prefix: (b.vertical_template_id ? prefixById.get(b.vertical_template_id) : null) ?? 'd',
  }));

  return (
    <CopyIndex
      prefix={COPY_PREFIX}
      publicPages={PUBLIC_PAGES}
      superadminPages={SUPERADMIN_PAGES}
      cabinetSections={CABINET_SECTIONS}
      roles={STAFF_ROLES.map((role) => ({ role, label: ROLE_LABELS[role] ?? role }))}
      services={services}
    />
  );
}
