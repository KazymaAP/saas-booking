// общие/lib/auth-roles.test.ts — 14 встроенных ролей и матрица прав по разделам.
import { describe, expect, it } from 'vitest';
import { BUILTIN_ROLES, isRole, ROLE_GENITIVE, ROLE_LABELS, STAFF_ROLES, sectionOf } from './auth-roles';
import { canRead, canWrite, ROLE_FLAGS, ROLE_MATRIX, SECTION_KEYS, sectionAllowed, sectionsForRole } from './sections';

describe('встроенные роли', () => {
  it('ровно 14 ролей, у каждой есть подпись и родительный падеж', () => {
    expect(BUILTIN_ROLES).toHaveLength(14);
    for (const role of BUILTIN_ROLES) {
      expect(ROLE_LABELS[role], role).toBeTruthy();
      expect(ROLE_GENITIVE[role], role).toBeTruthy();
      expect(isRole(role)).toBe(true);
    }
    expect(isRole('unknown')).toBe(false);
    expect(STAFF_ROLES).toHaveLength(13);
    expect(STAFF_ROLES).not.toContain('owner');
  });
});

describe('матрица прав', () => {
  it('owner может писать во все разделы; viewer — только читать', () => {
    for (const key of SECTION_KEYS) {
      expect(canWrite('owner', key), key).toBe(true);
      expect(canRead('viewer', key), key).toBe(true);
      expect(canWrite('viewer', key), key).toBe(false);
    }
  });

  it('manager: без подписки, команды и оформления, но с выгрузкой данных', () => {
    for (const key of ['subscription', 'team', 'appearance'] as const) expect(canRead('manager', key)).toBe(false);
    expect(canWrite('manager', 'settings')).toBe(true);
    expect(canWrite('manager', 'data')).toBe(true);
    expect(ROLE_FLAGS.manager.dataExport).toBe(true);
  });

  it('receptionist: главная, брони, уведомления и ничего лишнего', () => {
    expect(sectionsForRole('receptionist')).toEqual(['home', 'bookings', 'notifications']);
    expect(canWrite('receptionist', 'bookings')).toBe(true);
    expect(canWrite('receptionist', 'services')).toBe(false);
    expect(canRead('receptionist', 'services')).toBe(false);
  });

  it('content не видит bookings; callcenter и analyst не видят ПД', () => {
    expect(canRead('content', 'bookings')).toBe(false);
    expect(canRead('content', 'services')).toBe(true);
    expect(ROLE_FLAGS.callcenter.pii).toBe(false);
    expect(ROLE_FLAGS.analyst.pii).toBe(false);
    expect(ROLE_FLAGS.receptionist.pii).toBe(true);
  });

  it('auditor читает всё и выгружает данные; intern не выгружает', () => {
    for (const key of SECTION_KEYS) expect(canRead('auditor', key), key).toBe(true);
    expect(canWrite('auditor', 'data')).toBe(true);
    expect(ROLE_FLAGS.intern.dataExport).toBe(false);
    expect(ROLE_FLAGS.intern.pii).toBe(false);
  });

  it('finance: подписка на чтение и выгрузка; photographer/copywriter — по одному разделу', () => {
    expect(canRead('finance', 'subscription')).toBe(true);
    expect(canWrite('finance', 'subscription')).toBe(false);
    expect(canWrite('finance', 'data')).toBe(true);
    expect(sectionsForRole('photographer')).toEqual(['photos']);
    expect(sectionsForRole('copywriter')).toEqual(['texts']);
  });

  it('sectionAllowed и sectionOf сохраняют прежнее поведение', () => {
    expect(sectionAllowed('owner', 'team')).toBe(true);
    expect(sectionAllowed('manager', 'team')).toBe(false);
    expect(sectionOf('/s/tire/admin/settings/requisites')).toBe('settings');
    expect(sectionOf('/s/tire/admin')).toBe('');
  });

  it('у каждой роли есть строка в матрице и флагах', () => {
    for (const role of BUILTIN_ROLES) {
      expect(ROLE_MATRIX[role], role).toBeDefined();
      expect(ROLE_FLAGS[role], role).toBeDefined();
    }
  });
});
