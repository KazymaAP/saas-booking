// lib/email-panel.test.ts — разбор форм ящиков и шаблонов, нити входящих, тема и References ответа.
import { describe, expect, it, vi } from 'vitest';
import type { InboxMessage } from './email-panel';

vi.mock('./supabase', () => ({ adminClient: () => ({}) }));
vi.mock('./log', () => ({ logError: async () => undefined }));

const {
  contentChanged, filterThreads, groupThreads, parseAccountForm, parseInboxFilter, parseTemplateForm, replyReferences,
  replySubject, sampleClientVars, unknownPlaceholders,
} = await import('./email-panel');
const { TEMPLATE_VARIABLES } = await import('./email-render');

function form(values: Record<string, string>): { get(name: string): string | null } {
  return { get: (n) => (n in values ? values[n] : null) };
}

const ACC = { email: ' Sales@Zapishisya.ru ', smtp_pass: 'app-pass-1' };

describe('parseAccountForm', () => {
  it('нормализует адрес и подставляет дефолты Yandex 360', () => {
    const r = parseAccountForm(form(ACC), true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      email: 'sales@zapishisya.ru', smtp_host: 'smtp.yandex.ru', smtp_port: 465, smtp_secure: 'tls', smtp_user: 'sales@zapishisya.ru',
      imap_host: 'imap.yandex.ru', imap_port: 993, imap_secure: 'tls', daily_limit: 50, smtp_pass: 'app-pass-1', imap_pass: null,
    });
  });

  it('пароль обязателен для нового ящика, но не для правки', () => {
    expect(parseAccountForm(form({ email: 'a@b.ru' }), true).ok).toBe(false);
    const edit = parseAccountForm(form({ email: 'a@b.ru' }), false);
    expect(edit.ok && edit.value.smtp_pass).toBe(null);
  });

  it('отклоняет плохие порт, лимит, хост, reply_to и короткий пароль', () => {
    expect(parseAccountForm(form({ ...ACC, smtp_port: '70000' }), true)).toMatchObject({ ok: false });
    expect(parseAccountForm(form({ ...ACC, daily_limit: '0' }), true)).toMatchObject({ ok: false });
    expect(parseAccountForm(form({ ...ACC, daily_limit: '5000' }), true)).toMatchObject({ ok: false });
    expect(parseAccountForm(form({ ...ACC, smtp_host: 'smtp.yandex.ru\r\nX: y' }), true)).toMatchObject({ ok: false });
    expect(parseAccountForm(form({ ...ACC, reply_to: 'not-an-email' }), true)).toMatchObject({ ok: false });
    expect(parseAccountForm(form({ ...ACC, smtp_pass: '12' }), true)).toMatchObject({ ok: false });
    expect(parseAccountForm(form({ ...ACC, email: 'bad' }), true)).toMatchObject({ ok: false });
  });

  it('чистит имя отправителя от символов header injection', () => {
    const r = parseAccountForm(form({ ...ACC, from_name: 'Иван "Boss"\r\nBcc: x@y.ru <a>' }), true);
    expect(r.ok && r.value.from_name).toBe('Иван BossBcc: x@y.ru a');
  });

  it('STARTTLS по умолчанию для порта 587', () => {
    const r = parseAccountForm(form({ ...ACC, smtp_port: '587' }), true);
    expect(r.ok && r.value.smtp_secure).toBe('starttls');
  });
});

function msg(id: string, over: Partial<InboxMessage> = {}): InboxMessage {
  return {
    id, thread_id: null, message_id: `<${id}@x>`, from_email: 'owner@koleso.ru', subject: 'Re: Сайт', received_at: '2026-10-15T10:00:00Z',
    is_read: true, business_id: 'b1', email_account_id: 'acc1', ...over,
  };
}

describe('groupThreads / filterThreads', () => {
  const list = [
    msg('a', { thread_id: 'T1', received_at: '2026-10-15T09:00:00Z' }),
    msg('b', { thread_id: 'T1', received_at: '2026-10-15T12:00:00Z', is_read: false }),
    msg('c', { thread_id: 'T2', received_at: '2026-10-15T11:00:00Z' }),
    msg('d', { thread_id: null, received_at: null }),
  ];

  it('группирует по thread_id, внутри — по времени, нити — по последнему письму', () => {
    const t = groupThreads(list, new Set());
    expect(t.map((x) => x.key)).toEqual(['T1', 'T2', '<d@x>']);
    expect(t[0].messages.map((m) => m.id)).toEqual(['a', 'b']);
    expect(t[0].unread).toBe(1);
  });

  it('один отправитель в разных нитях не склеивается (раньше группировалось по адресу)', () => {
    expect(groupThreads(list, new Set()).filter((x) => x.messages[0].from_email === 'owner@koleso.ru')).toHaveLength(3);
  });

  it('фильтры: непрочитанные, отвеченные, все', () => {
    const t = groupThreads(list, new Set(['<c@x>']));
    expect(filterThreads(t, 'unread').map((x) => x.key)).toEqual(['T1']);
    expect(filterThreads(t, 'answered').map((x) => x.key)).toEqual(['T2']);
    expect(filterThreads(t, 'all')).toHaveLength(3);
    expect(parseInboxFilter('evil')).toBe('all');
  });
});

describe('ответ: тема и References', () => {
  it('Re: добавляется один раз, переводы строк удаляются', () => {
    expect(replySubject('Сайт')).toBe('Re: Сайт');
    expect(replySubject('RE: Сайт')).toBe('RE: Сайт');
    expect(replySubject('a\r\nBcc: x@y.ru')).toBe('Re: a Bcc: x@y.ru');
    expect(replySubject(null)).toBe('Re:');
  });

  it('References = References исходного + его Message-ID, без дублей', () => {
    expect(replyReferences({ message_id: '<b@x>', references: '<a@x>' })).toBe('<a@x> <b@x>');
    expect(replyReferences({ message_id: '<a@x>', references: '<a@x>' })).toBe('<a@x>');
    expect(replyReferences({ message_id: null, references: null })).toBe(null);
  });
});

describe('parseTemplateForm', () => {
  const base = { channel: 'outreach', type: 'outreach_tire', name: 'Шины', subject: 'Сайт для {name}', body_text: 'Привет, {name}! {foo}', active: '1' };

  it('собирает шаблон и список известных переменных', () => {
    const r = parseTemplateForm(form(base));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ channel: 'outreach', type: 'outreach_tire', body_html: null, variables: ['name'], active: true });
    expect(unknownPlaceholders(r.value)).toEqual(['foo']);
  });

  it('тип должен соответствовать каналу; канал — из списка', () => {
    expect(parseTemplateForm(form({ ...base, type: 'booking_new' }))).toMatchObject({ ok: false });
    expect(parseTemplateForm(form({ ...base, channel: 'client', type: 'booking_new' })).ok).toBe(true);
    expect(parseTemplateForm(form({ ...base, channel: 'sms' }))).toMatchObject({ ok: false });
  });

  it('нужен текст или HTML; тема без CRLF; active=0 выключает', () => {
    expect(parseTemplateForm(form({ ...base, body_text: '' }))).toMatchObject({ ok: false });
    const r = parseTemplateForm(form({ ...base, subject: 'a\r\nb', active: '0', vertical_template_id: 'x' }));
    expect(r.ok).toBe(false);
    const ok = parseTemplateForm(form({ ...base, subject: 'a\r\nb', active: '0' }));
    expect(ok.ok && ok.value.subject).toBe('a b');
    expect(ok.ok && ok.value.active).toBe(false);
  });

  it('contentChanged игнорирует пробелы по краям и null/пусто', () => {
    expect(contentChanged({ subject: 'A', body_text: 'B ', body_html: null }, { subject: 'A', body_text: 'B', body_html: '' })).toBe(false);
    expect(contentChanged({ subject: 'A', body_text: 'B', body_html: null }, { subject: 'A2', body_text: 'B', body_html: null })).toBe(true);
  });

  it('демо-данные предпросмотра покрывают все переменные ТЗ §9.9', () => {
    const vars = sampleClientVars('https://zapishisya.ru');
    for (const v of TEMPLATE_VARIABLES) expect(vars[v], v).toBeTruthy();
  });
});
