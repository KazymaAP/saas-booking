// app/admin/chat-threads.test.ts — группировка переписки для раздела «Чат».
// Проверяем то, что легко сломать незаметно: склейку сообщений в один диалог,
// приоритет business_id над chat_id, обрезку превью и порядок диалогов.
import { describe, expect, it } from 'vitest';
import { groupMessages, shortText, sortGroups, threadKey, type RawMessage } from './chat-threads';

function row(over: Partial<RawMessage>): RawMessage {
  return {
    id: 1,
    direction: 'in',
    chat_id: null,
    business_id: null,
    text: 'текст',
    created_at: '2026-11-01T10:00:00Z',
    ...over,
  };
}

describe('threadKey', () => {
  it('привязанный бизнес важнее чата', () => {
    expect(threadKey({ business_id: 'biz-1', chat_id: '555' })).toBe('b:biz-1');
  });

  it('чат без бизнеса — отдельный диалог', () => {
    expect(threadKey({ business_id: null, chat_id: '555' })).toBe('c:555');
  });

  it('сообщение без привязки пропускается', () => {
    expect(threadKey({ business_id: null, chat_id: null })).toBeNull();
  });
});

describe('groupMessages', () => {
  it('склеивает сообщения одного бизнеса и считает их', () => {
    const groups = groupMessages([
      row({ id: 3, business_id: 'biz-1', chat_id: '555', direction: 'in', text: 'последнее' }),
      row({ id: 2, business_id: 'biz-1', chat_id: '555', direction: 'out', text: 'ответ' }),
      row({ id: 1, business_id: 'biz-1', chat_id: '555', direction: 'in', text: 'первое' }),
    ]);
    expect(groups.size).toBe(1);
    const group = groups.get('b:biz-1');
    expect(group?.count).toBe(3);
    expect(group?.last.text).toBe('последнее');
    expect(group?.last.direction).toBe('in');
  });

  it('разные бизнесы — разные диалоги, даже при одном chat_id', () => {
    const groups = groupMessages([
      row({ id: 2, business_id: 'biz-2', chat_id: '777' }),
      row({ id: 1, business_id: 'biz-1', chat_id: '777' }),
    ]);
    expect([...groups.keys()].sort()).toEqual(['b:biz-1', 'b:biz-2']);
  });

  it('сообщения без привязки не создают диалог', () => {
    const groups = groupMessages([row({ business_id: null, chat_id: null })]);
    expect(groups.size).toBe(0);
  });

  it('первое сообщение в списке становится последним в диалоге (сортировка по убыванию)', () => {
    const groups = groupMessages([
      row({ id: 9, business_id: 'biz-1', created_at: '2026-11-02T09:00:00Z', text: 'свежее' }),
      row({ id: 8, business_id: 'biz-1', created_at: '2026-11-01T09:00:00Z', text: 'старое' }),
    ]);
    expect(groups.get('b:biz-1')?.last.text).toBe('свежее');
  });
});

describe('shortText', () => {
  it('схлопывает переносы и пробелы', () => {
    expect(shortText('  привет\n\nмир  ')).toBe('привет мир');
  });

  it('режет длинный текст до 120 символов с многоточием', () => {
    const value = shortText('я'.repeat(300));
    expect(value.length).toBe(120);
    expect(value.endsWith('…')).toBe(true);
  });

  it('null превращается в пустую строку', () => {
    expect(shortText(null)).toBe('');
  });
});

describe('sortGroups', () => {
  it('свежие диалоги сверху', () => {
    const sorted = sortGroups([
      { lastAt: '2026-11-01T10:00:00Z', name: 'старый' },
      { lastAt: '2026-11-03T10:00:00Z', name: 'новый' },
      { lastAt: '2026-11-02T10:00:00Z', name: 'средний' },
    ]);
    expect(sorted.map((t) => t.name)).toEqual(['новый', 'средний', 'старый']);
  });

  it('не мутирует исходный массив', () => {
    const input = [{ lastAt: '2026-11-01T10:00:00Z' }, { lastAt: '2026-11-02T10:00:00Z' }];
    sortGroups(input);
    expect(input[0].lastAt).toBe('2026-11-01T10:00:00Z');
  });
});
