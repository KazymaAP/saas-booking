// lib/cron-jobs/cleanup-unused-roles.test.ts — П1 (автоудаление) и П2 (уведомление за 10 дней) кастомных ролей.
// Выборка кандидатов идёт через SQL-функции cron_select_roles_to_notify / cron_select_unused_roles (миграция 0023),
// которые в тесте эмулируются через options.rpc поверх in-memory БД.
import { describe, expect, it } from 'vitest';
import { cleanupUnusedRoles } from './cleanup-unused-roles';
import { daysFrom, memoryContext } from '../test-utils/context';
import type { MemoryDb, Row } from '../test-utils/memory-db';

const NOW = new Date('2026-10-15T09:00:00.000Z');

function staleBefore(args: Row, db: MemoryDb): Row[] {
  const before = String(args.p_before);
  return (db.tables['business_custom_roles'] ?? []).filter((r) => {
    const stale = r.last_used_at ?? r.created_at;
    return String(stale) < before;
  });
}

// cron_select_roles_to_notify: старее p_before И ещё не уведомляли.
function selectToNotify(args: Row, db: MemoryDb): Row[] {
  return staleBefore(args, db)
    .filter((r) => r.removal_notified_at === null || r.removal_notified_at === undefined)
    .map((r) => ({ id: r.id, business_id: r.business_id, name: r.name, last_used_at: r.last_used_at ?? null, created_at: r.created_at }));
}

// cron_select_unused_roles: старее p_before И нет назначенных сотрудников (NOT EXISTS в admin_users).
function selectUnused(args: Row, db: MemoryDb): Row[] {
  const members = db.tables['admin_users'] ?? [];
  return staleBefore(args, db)
    .filter((r) => members.some((m) => m.business_id === r.business_id && m.role === `custom:${r.id}`) === false)
    .map((r) => ({ id: r.id, business_id: r.business_id }));
}

const RPC = { cron_select_roles_to_notify: selectToNotify, cron_select_unused_roles: selectUnused };

const BUSINESSES: Row[] = [
  { id: 'b1', name: 'Шиномонтаж', emails: ['owner@biz.ru'], telegram_chat_id: 'chat-1' },
  { id: 'b2', name: 'Без контактов', emails: null, telegram_chat_id: null },
];

function ctx(roles: Row[], members: Row[] = []) {
  return memoryContext(
    { business_custom_roles: roles, admin_users: members, businesses: BUSINESSES },
    { now: NOW, rpc: RPC },
  );
}

describe('cleanup-unused-roles: П1/П2', () => {
  it('свежая роль — ничего не делает', async () => {
    const c = ctx([{ id: 'r1', business_id: 'b1', name: 'Только брони', created_at: daysFrom(NOW, -5), last_used_at: null, removal_notified_at: null }]);
    const res = await cleanupUnusedRoles(c);
    expect(res).toMatchObject({ notified: 0, deleted: 0 });
  });

  it('П2: роль на 25-й день неактивности — уведомление владельца и проставление removal_notified_at', async () => {
    const c = ctx([{ id: 'r1', business_id: 'b1', name: 'Только брони', created_at: daysFrom(NOW, -25), last_used_at: null, removal_notified_at: null }]);
    const res = await cleanupUnusedRoles(c);
    expect(res.notified).toBe(1);
    expect(res.deleted).toBe(0);
    expect(c.notifyMock.mails).toHaveLength(1);
    expect(c.notifyMock.mails[0].to).toBe('owner@biz.ru');
    expect(c.notifyMock.telegrams).toHaveLength(1);
    expect(c.notifyMock.telegrams[0].chatId).toBe('chat-1');
    // проставлен флаг, чтобы повторно не уведомлять и чтобы UI показал баннер
    const role = c.mem.tables.business_custom_roles.find((r) => r.id === 'r1');
    expect(role?.removal_notified_at).not.toBeNull();
  });

  it('П2: уже уведомлённая роль (removal_notified_at задан) повторно не уведомляется', async () => {
    const c = ctx([{ id: 'r1', business_id: 'b1', name: 'Только брони', created_at: daysFrom(NOW, -25), last_used_at: null, removal_notified_at: daysFrom(NOW, -3) }]);
    const res = await cleanupUnusedRoles(c);
    expect(res.notified).toBe(0);
    expect(c.notifyMock.mails).toHaveLength(0);
  });

  it('П2: просроченная роль (удаление уже наступило) не уведомляется, но удаляется П1', async () => {
    const c = ctx([{ id: 'r1', business_id: 'b1', name: 'Только брони', created_at: daysFrom(NOW, -35), last_used_at: null, removal_notified_at: null }]);
    const res = await cleanupUnusedRoles(c);
    expect(res.notified).toBe(0);
    expect(res.deleted).toBe(1);
    expect(c.mem.tables.business_custom_roles.find((r) => r.id === 'r1')).toBeUndefined();
  });

  it('П1: роль без сотрудников старше 30 дней удаляется; с назначенным сотрудником — нет', async () => {
    const c = ctx(
      [
        { id: 'r1', business_id: 'b1', name: 'Без людей', created_at: daysFrom(NOW, -40), last_used_at: null, removal_notified_at: null },
        { id: 'r2', business_id: 'b1', name: 'С людьми', created_at: daysFrom(NOW, -40), last_used_at: null, removal_notified_at: null },
      ],
      [{ id: 'm1', business_id: 'b1', role: 'custom:r2', email: 'man@biz.ru' }],
    );
    const res = await cleanupUnusedRoles(c);
    expect(res.deleted).toBe(1);
    expect(c.mem.tables.business_custom_roles.find((r) => r.id === 'r1')).toBeUndefined();
    expect(c.mem.tables.business_custom_roles.find((r) => r.id === 'r2')).toBeDefined();
  });

  it('П2: если у бизнеса нет контактов, уведомление не уходит и removal_notified_at не ставится (retry в следующий запуск)', async () => {
    const c = ctx([{ id: 'r1', business_id: 'b2', name: 'Одинокая', created_at: daysFrom(NOW, -25), last_used_at: null, removal_notified_at: null }]);
    const res = await cleanupUnusedRoles(c);
    expect(res.notified).toBe(0);
    expect(c.notifyMock.mails).toHaveLength(0);
    expect(c.mem.tables.business_custom_roles.find((r) => r.id === 'r1')?.removal_notified_at).toBeNull();
  });

  it('ошибка RPC cron_select_roles_to_notify → исключение (500 + logError в runCronJob)', async () => {
    const c = memoryContext(
      { business_custom_roles: [{ id: 'r1', business_id: 'b1', name: 'x', created_at: daysFrom(NOW, -25), last_used_at: null, removal_notified_at: null }] },
      { now: NOW, failOn: (q) => (q.table === 'rpc:cron_select_roles_to_notify' ? 'connection reset' : null) },
    );
    await expect(cleanupUnusedRoles(c)).rejects.toThrow('connection reset');
  });
});
