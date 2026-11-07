// ready-services.test.ts — право партнёра менять фото готового сервиса.
// Регрессия: экшены принимали id сервиса без проверки владельца — любой авторизованный
// партнёр мог перезаписать галерею чужого, уже взятого в работу сайта.
import { describe, expect, it } from 'vitest';
import { canPartnerEditReady, type ReadyAccessRow } from './ready-services';

const ME = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const active = { status: 'active' };

function svc(over: Partial<ReadyAccessRow> = {}): ReadyAccessRow {
  return { status: 'approved', assignment_status: 'available', assigned_partner_id: null, ...over };
}

describe('canPartnerEditReady', () => {
  it('одобренный свободный сервис доступен любому активному партнёру', () => {
    expect(canPartnerEditReady(active, svc(), ME)).toBeNull();
    expect(canPartnerEditReady(active, svc(), OTHER)).toBeNull();
  });

  it('сервис в работе доступен только тому, кто его взял', () => {
    const taken = svc({ assignment_status: 'in_process', assigned_partner_id: ME });
    expect(canPartnerEditReady(active, taken, ME)).toBeNull();
    expect(canPartnerEditReady(active, taken, OTHER)).toBe('Сервис закреплён за другим партнёром');
  });

  it('неодобренный сервис нельзя править никому', () => {
    expect(canPartnerEditReady(active, svc({ status: 'draft' }), ME)).toBe('Сервис ещё не одобрен');
    expect(canPartnerEditReady(active, svc({ status: 'rejected' }), ME)).toBe('Сервис ещё не одобрен');
  });

  it('заблокированный или несуществующий партнёр не проходит', () => {
    expect(canPartnerEditReady({ status: 'blocked' }, svc(), ME)).toBe('Аккаунт заблокирован');
    expect(canPartnerEditReady(null, svc(), ME)).toBe('Аккаунт заблокирован');
  });

  it('несуществующий сервис — понятная ошибка', () => {
    expect(canPartnerEditReady(active, null, ME)).toBe('Сервис не найден');
  });

  it('битое состояние «в работе, но без владельца» не открывает доступ всем', () => {
    const broken = svc({ assignment_status: 'in_process', assigned_partner_id: null });
    expect(canPartnerEditReady(active, broken, OTHER)).toBe('Сервис закреплён за другим партнёром');
  });
});
