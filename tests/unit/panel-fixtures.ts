// tests/unit/panel-fixtures.ts — общие данные и моки модулей для тестов actions кабинета.
import type { AdminUser, Business } from '@/lib/database.types';

export const BUSINESS_ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_ID = '22222222-2222-4222-8222-222222222222';
export const ROW_ID = '33333333-3333-4333-8333-333333333333';
export const SLUG = 'studio-test';

export function makeBusiness(patch: Partial<Business> = {}): Business {
  // Тестам нужна лишь часть полей бизнеса; остальное заполнено нейтрально.
  const base: Partial<Business> = {
    id: BUSINESS_ID, slug: SLUG, name: 'Студия', description: null, address: null, city: null,
    phones: [], emails: [], working_hours: null, brand_color: '#111111', status: 'client',
    custom_texts: { booking_title: 'Онлайн-запись' }, subscription_active: true, subscription_until: null,
    subscription_price: 2500, deletion_scheduled_at: null, auto_confirm: false,
  };
  return { ...base, ...patch } as Business;
}

export function makeMember(role: AdminUser['role']): AdminUser {
  return { id: ROW_ID, business_id: BUSINESS_ID, email: `${role}@test.ru`, role, auth_user_id: 'auth-1', created_at: '2026-01-01T00:00:00Z' };
}
