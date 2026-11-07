// lib/demo-constants.ts — константы демо-кабинетов. Модуль без Node-зависимостей:
// импортируется и в серверных страницах, и в клиентских компонентах.
export const DEMO_PARTNER_EMAIL = 'demo-partner@zapishisya.ru';
export const DEMO_PARTNER_NAME = 'DEMO Партнёр';
export const DEMO_PARTNER_REF = 'PR-DEMO01';
export const DEMO_OWNER_EMAIL = 'demo-owner@zapishisya.ru';
export const DEMO_OWNER_NAME = 'DEMO Предприниматель';
export const DEMO_PASSWORD = 'demo12345';
export const DEMO_PREFIX = 'm';
export const DEMO_SLUG = 'demo';
export const DEMO_BUSINESS_NAME = 'DEMO — Студия маникюра «Любава»';

export function isDemoPartner(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === DEMO_PARTNER_EMAIL;
}

export function isDemoBusiness(slug: string | null | undefined): boolean {
  return (slug ?? '').trim().toLowerCase() === DEMO_SLUG;
}
