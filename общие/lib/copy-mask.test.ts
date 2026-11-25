// общие/lib/copy-mask.test.ts — обезличивание контактов в разделе копий /test/ful/sts.
// Проверяем то, ради чего модуль появился: настоящие имя и телефон клиента не попадают в HTML копии,
// при этом витрина остаётся правдоподобной, а данные — стабильными между рендерами.
import { describe, expect, it } from 'vitest';
import { maskContacts, maskEmail } from './copy-mask';

type Row = { id: string; client_name: string | null; client_phone: string | null; comment?: string | null };

const row = (over: Partial<Row> = {}): Row => ({
  id: 'b1',
  client_name: 'Павел',
  client_phone: '+7 913 444-55-66',
  comment: null,
  ...over,
});

describe('maskContacts', () => {
  it('заменяет имя и телефон клиента демо-значениями', () => {
    const [masked] = maskContacts([row()]);
    expect(masked.client_name).not.toBe('Павел');
    expect(masked.client_phone).not.toBe('+7 913 444-55-66');
    expect(masked.client_phone).toMatch(/^\+7 900 \d{3}-\d{2}-\d{2}$/);
  });

  it('подстановка детерминированная: та же строка — те же значения при перерисовке', () => {
    const first = maskContacts([row({ id: 'abc' })])[0];
    const second = maskContacts([row({ id: 'abc' })])[0];
    expect(second).toEqual(first);
  });

  it('разные записи получают разные телефоны', () => {
    const rows = maskContacts([row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]);
    expect(new Set(rows.map((r) => r.client_phone)).size).toBeGreaterThan(1);
  });

  it('пустые контакты остаются пустыми, а не превращаются в демо-данные', () => {
    const [masked] = maskContacts([row({ client_name: null, client_phone: null })]);
    expect(masked.client_name).toBeNull();
    expect(masked.client_phone).toBeNull();
  });

  it('не трогает то, что не является персональными данными', () => {
    const source = { ...row(), status: 'new', service: 'Шиномонтаж', starts_at: 1_700_000_000_000 };
    const [masked] = maskContacts([source]);
    expect(masked.status).toBe('new');
    expect(masked.service).toBe('Шиномонтаж');
    expect(masked.starts_at).toBe(1_700_000_000_000);
    expect(masked.id).toBe(source.id);
  });

  it('исходные строки не мутируются — по ним считаются счётчики и выручка', () => {
    const source = row();
    maskContacts([source]);
    expect(source.client_name).toBe('Павел');
    expect(source.client_phone).toBe('+7 913 444-55-66');
  });

  it('в комментарии гасит длинные цифры (клиент пишет туда телефон), текст оставляет', () => {
    const [masked] = maskContacts([row({ comment: 'Зимняя резина, звонить 89134445566' })]);
    expect(masked.comment).not.toContain('89134445566');
    expect(masked.comment).toContain('Зимняя резина');
  });

  it('поле comment не появляется там, где его не было (строка смены)', () => {
    const [masked] = maskContacts([{ id: 'x', client_name: 'Игорь', client_phone: '+7 913 111-22-33' }]);
    expect('comment' in masked).toBe(false);
  });
});

describe('maskEmail', () => {
  it('не оставляет настоящий логин сотрудника', () => {
    const masked = maskEmail('admin@vippro.panel.zapishisya.ru');
    expect(masked).not.toContain('vippro');
    expect(masked).toMatch(/^member\d{1,2}@example\.ru$/);
  });

  it('детерминирован: один и тот же логин — один и тот же результат', () => {
    expect(maskEmail('a@b.ru')).toBe(maskEmail('a@b.ru'));
  });

  it('разные логины получают разные адреса', () => {
    expect(maskEmail('admin@vippro.panel.zapishisya.ru')).not.toBe(maskEmail('master@vippro.panel.zapishisya.ru'));
  });

  it('пустое значение остаётся пустым', () => {
    expect(maskEmail(null)).toBeNull();
  });
});
