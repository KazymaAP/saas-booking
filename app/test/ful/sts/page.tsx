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

// Стили оглавления. Держим их здесь, а не в Tailwind-классах: у 3100 ссылок повторяющиеся
// классы занимали 61% HTML (757 КБ). С короткими классами страница стала втрое легче —
// её успевают прочитать и люди на мобильном интернете, и ИИ-агенты.
// Всё под префиксом .cx и удаляется вместе с папкой.
const COPY_CSS = `
.cx{min-height:100vh;background:#060f1a;color:#e6edf7;position:relative;box-sizing:border-box}
.cx *,.cx *::before,.cx *::after{box-sizing:border-box}
.cx-glow{position:fixed;inset:0;overflow:hidden;pointer-events:none}
.cx-g1{position:absolute;left:-160px;top:-160px;width:520px;height:520px;border-radius:50%;background:rgba(56,189,248,.1);filter:blur(64px)}
.cx-g2{position:absolute;right:-120px;bottom:-160px;width:460px;height:460px;border-radius:50%;background:rgba(167,139,250,.1);filter:blur(64px)}
.cx-wrap{position:relative;margin:0 auto;max-width:1180px;padding:40px 16px}
.cx-badge{display:inline-flex;align-items:center;gap:8px;border-radius:999px;border:1px solid rgba(56,189,248,.4);background:rgba(56,189,248,.1);padding:4px 12px;font-size:12px;font-weight:500;color:#bae6fd}
.cx-h1{margin:16px 0 8px;font-size:30px;line-height:1.15;font-weight:600;color:#fff}
.cx-lead{margin:0;max-width:720px;font-size:15px;line-height:1.65;color:#a8bcd4}
.cx-code{border-radius:4px;background:rgba(255,255,255,.1);padding:2px 6px;font-size:13px;color:#bae6fd}
.cx-warn{margin:12px 0 0;max-width:720px;border-radius:12px;border:1px solid rgba(251,191,36,.3);background:rgba(251,191,36,.1);padding:8px 12px;font-size:13px;line-height:1.65;color:#fef3c7}
.cx-nav{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}
.cx-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);padding:8px 12px;font-size:13px;font-weight:500;color:#e6edf7;text-decoration:none;transition:border-color .15s,background-color .15s,color .15s}
.cx-btn:hover{border-color:#38bdf8;background:rgba(56,189,248,.1);color:#fff}
.cx-btn-p{border-color:rgba(56,189,248,.6);background:rgba(56,189,248,.15);font-weight:600;color:#bae6fd}
.cx-btn-p:hover{background:rgba(56,189,248,.25)}
.cx-sec{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 12px;margin:40px 0 16px}
.cx-h2{margin:0;font-size:20px;font-weight:600;color:#fff}
.cx-hint{font-size:13px;color:#8aa0bb}
.cx-grid{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}
.cx-search-wrap{position:sticky;top:0;z-index:10;margin:0 -4px 16px;padding:8px 4px;background:rgba(6,15,26,.85);backdrop-filter:blur(8px)}
.cx-search{width:100%;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:#0b1725;padding:10px 16px;font-size:14px;color:#fff;outline:none;font-family:inherit}
.cx-search:focus{border-color:#38bdf8}
.cx-search::placeholder{color:#6b7f96}
.cx-cards{display:grid;gap:12px}
.cx-card{border-radius:16px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);padding:16px}
.cx-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
.cx-headText{min-width:0}
.cx-name{margin:0;font-size:15px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cx-path{margin:0;font-size:12px;color:#7c93ad;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cx-status{flex-shrink:0;border-radius:999px;border:1px solid rgba(255,255,255,.15);padding:2px 8px;font-size:11px;color:#8aa0bb}
.cx-row{display:flex;flex-wrap:wrap;gap:8px}
.cx-details{margin-top:12px}
.cx-summary{cursor:pointer;list-style:none;font-size:13px;font-weight:500;color:#7dd3fc}
.cx-summary::-webkit-details-marker{display:none}
.cx-summary:hover{color:#fff}
.cx-groups{display:flex;flex-direction:column;gap:12px;margin-top:12px}
.cx-gt{margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#6b7f96}
.cx-chips{display:flex;flex-wrap:wrap;gap:6px}
.cx-chip{border-radius:8px;border:1px solid rgba(255,255,255,.1);padding:4px 8px;font-size:12px;color:#c7d7e8;text-decoration:none}
.cx-chip:hover{border-color:#38bdf8;color:#fff}
.cx-empty{margin:0;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);padding:24px 16px;text-align:center;font-size:14px;color:#8aa0bb}
.cx-foot{margin-top:48px;border-top:1px solid rgba(255,255,255,.1);padding-top:20px;font-size:12px;line-height:1.65;color:#6b7f96}
@media (min-width:640px){.cx-wrap{padding:40px 24px}.cx-h1{font-size:36px}.cx-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (min-width:1024px){.cx-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media (min-width:768px){.cx-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

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
    <>
      <style>{COPY_CSS}</style>
      <CopyIndex
        prefix={COPY_PREFIX}
        publicPages={PUBLIC_PAGES}
        superadminPages={SUPERADMIN_PAGES}
        cabinetSections={CABINET_SECTIONS}
        roles={STAFF_ROLES.map((role) => ({ role, label: ROLE_LABELS[role] ?? role }))}
        services={services}
      />
    </>
  );
}
