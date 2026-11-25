// tests/unit/panel-copy-guards.test.ts — раздел копий /test/ful/sts: что там можно, а что нельзя.
//
// Копия открыта без входа по задумке: это витрина и обход для краулеров. Пока эти проверки не стояли,
// кнопки в открытом кабинете («удалить услугу», «скрыть фото», «сменить цены») писали в настоящую базу
// от имени владельца. Тест фиксирует границу: смотреть — да, менять — нет.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser, Business } from '@/lib/database.types';
import { SLUG, makeBusiness, makeMember } from './panel-fixtures';

type Access = { business: Business; member: AdminUser };
const copy = vi.hoisted(() => ({ mode: false }));
const session = vi.hoisted(() => ({ current: null as Access | null, reads: 0 }));
const redirect = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect,
  notFound: () => {
    throw new Error('notFound');
  },
}));
vi.mock('@/lib/copy-mode', () => ({ inCopyMode: () => copy.mode }));
vi.mock('@/lib/owner-session', () => ({
  currentOwner: async () => {
    session.reads += 1;
    return session.current;
  },
}));

const { actionAccess, requireSectionAccess, writeAccess } = await import(
  '../../../app/[prefix]/[slug]/admin/(protected)/_lib/access'
);

const params = { prefix: 'd', slug: SLUG };

beforeEach(() => {
  copy.mode = false;
  session.reads = 0;
  session.current = { business: makeBusiness(), member: makeMember('owner') };
  redirect.mockReset();
});

describe('кабинет в обычном режиме', () => {
  it('владелец пишет в разрешённый раздел', async () => {
    expect(await writeAccess(SLUG, 'services')).not.toBeNull();
  });

  it('менеджер не пишет в разделы владельца', async () => {
    session.current = { business: makeBusiness(), member: makeMember('manager') };
    expect(await writeAccess(SLUG, 'team')).toBeNull();
  });
});

describe('кабинет в разделе копий (/test/ful/sts)', () => {
  it('writeAccess отказывает, хотя владелец «есть»', async () => {
    copy.mode = true;
    expect(await writeAccess(SLUG, 'services')).toBeNull();
    expect(await writeAccess(SLUG, 'photos')).toBeNull();
    expect(await writeAccess(SLUG, 'settings')).toBeNull();
  });

  it('actionAccess отказывает: ни один меняющий action не проходит', async () => {
    copy.mode = true;
    expect(await actionAccess(SLUG)).toBeNull();
  });

  it('отказ выдаётся до обращения к сессии — заголовку копии нечего подделывать', async () => {
    copy.mode = true;
    await writeAccess(SLUG, 'services');
    await actionAccess(SLUG);
    expect(session.reads).toBe(0);
  });

  it('просмотр разделов по-прежнему работает: requireSectionAccess пускает', async () => {
    copy.mode = true;
    const access = await requireSectionAccess(params, 'bookings');
    expect(access.business.slug).toBe(SLUG);
  });
});
