// lib/email-inbound.test.ts — разбор входящих: автоответы, bounce (DSN), threading, sanitize, вложения.
// Письма — сырые RFC 5322 строки, разбираются настоящим mailparser.
import { describe, expect, it } from 'vitest';
import { simpleParser } from 'mailparser';
import {
  classifyBounce, classifyInbound, domainOf, isAutoReply, isFreeMailDomain, messageFolder, parentIds, parseBounce,
  safeFilename, sanitizeIncomingHtml, storedAttachments, threadIdOf,
} from './email-inbound';
import { dsn, raw } from './__fixtures__/mail';

const parse = (s: string) => simpleParser(Buffer.from(s, 'utf8'));

describe('автоответы и спам', () => {
  it('Auto-Submitted: auto-replied → автоответ, auto-submitted: no → нет', async () => {
    expect(isAutoReply(await parse(raw({ 'Auto-Submitted': 'auto-replied' }, 'В отпуске')))).toBe(true);
    expect(isAutoReply(await parse(raw({ 'Auto-Submitted': 'no' }, 'Ответ')))).toBe(false);
  });
  it('X-Autoreply, Precedence: bulk, X-Auto-Response-Suppress', async () => {
    expect(isAutoReply(await parse(raw({ 'X-Autoreply': 'yes' }, 'x')))).toBe(true);
    expect(isAutoReply(await parse(raw({ Precedence: 'bulk' }, 'x')))).toBe(true);
    expect(isAutoReply(await parse(raw({ 'X-Auto-Response-Suppress': 'All' }, 'x')))).toBe(true);
  });
  it('X-Spam-Flag: YES → spam', async () => {
    expect(classifyInbound(await parse(raw({ 'X-Spam-Flag': 'YES' }, 'x')))).toBe('spam');
  });
  it('обычный ответ → message', async () => {
    expect(classifyInbound(await parse(raw({}, 'Интересно, расскажите')))).toBe('message');
  });
});

describe('bounce', () => {
  it('DSN 550 5.1.1 → hard, адрес и исходный Message-ID', async () => {
    const mail = await parse(dsn('nobody@koleso.ru', '5.1.1', '550 5.1.1 User unknown'));
    expect(classifyInbound(mail)).toBe('bounce');
    expect(parseBounce(mail)).toMatchObject({ type: 'hard', recipient: 'nobody@koleso.ru', code: 550, status: '5.1.1', originalMessageId: '<orig@zapishisya.ru>' });
  });
  it('DSN 452 4.2.2 → soft', async () => {
    expect(parseBounce(await parse(dsn('full@koleso.ru', '4.2.2', '452 4.2.2 Mailbox full')))?.type).toBe('soft');
  });
  it('bounce без DSN-части от MAILER-DAEMON распознаётся по теме', async () => {
    const mail = await parse(raw({ From: 'mailer-daemon@mail.ru', Subject: 'Undelivered mail' }, 'Delivery to <x@koleso.ru> failed: 550 no such user'));
    expect(parseBounce(mail)).toMatchObject({ type: 'hard', recipient: 'x@koleso.ru', code: 550 });
  });
  it('классификация кодов', () => {
    expect(classifyBounce(551, null)).toBe('hard');
    expect(classifyBounce(553, null)).toBe('hard');
    expect(classifyBounce(421, null)).toBe('soft');
    expect(classifyBounce(null, '5.1.2')).toBe('hard');
    expect(classifyBounce(554, '5.7.1')).toBe('soft');
  });
  it('обычное письмо — не bounce', async () => {
    expect(parseBounce(await parse(raw({}, 'Привет')))).toBeNull();
  });
});

describe('threading', () => {
  it('In-Reply-To первым, затем References с конца, без дублей', async () => {
    const mail = await parse(raw({ 'In-Reply-To': '<b@x>', References: '<a@x> <b@x>' }, 'x'));
    expect(parentIds(mail)).toEqual(['<b@x>', '<a@x>']);
    expect(threadIdOf(mail, '<self@x>')).toBe('<a@x>');
  });
  it('без ссылок thread_id = собственный Message-ID', async () => {
    expect(threadIdOf(await parse(raw({}, 'x')), 'fb')).toBe('<r1@koleso.ru>');
  });
});

describe('домены', () => {
  it('бесплатные почты не используются для связки', () => {
    expect(isFreeMailDomain('gmail.com')).toBe(true);
    expect(isFreeMailDomain('Yandex.RU')).toBe(true);
    expect(isFreeMailDomain('koleso.ru')).toBe(false);
    expect(domainOf('A@Koleso.RU')).toBe('koleso.ru');
  });
});

describe('sanitizeIncomingHtml', () => {
  it('удаляет script, обработчики, javascript: и style', () => {
    const out = sanitizeIncomingHtml('<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">l</a><style>p{}</style><iframe src="x"></iframe>');
    expect(out).not.toMatch(/script|onclick|javascript:|<style|<iframe/i);
    expect(out).toContain('<p>Hi</p>');
  });
  it('ссылки получают rel=noopener и target=_blank, внешние картинки удаляются', () => {
    const out = sanitizeIncomingHtml('<a href="https://x.ru">x</a><img src="https://tracker.example/p.gif">');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).not.toContain('tracker.example');
  });
});

describe('вложения', () => {
  it('safeFilename убирает каталоги, управляющие символы и ведущие точки', () => {
    expect(safeFilename('../../etc/passwd', 0)).toBe('passwd');
    expect(safeFilename('..\\win\\..hidden', 0)).toBe('hidden');
    expect(safeFilename('пр<ай>с?.pdf', 0)).toBe('пр_ай_с_.pdf');
    expect(safeFilename(undefined, 2)).toBe('attachment-3.bin');
  });
  it('messageFolder безопасен для пути', () => {
    expect(messageFolder('<abc/../d@x.ru>')).toBe('abc_.._d@x.ru');
  });
  it('служебные части DSN не считаются вложениями', async () => {
    expect(storedAttachments(await parse(dsn('a@b.ru', '5.1.1', '550 x')))).toHaveLength(0);
  });
});

describe('спам-вердикты серверов (раунд 3)', () => {
  it('X-Spam-Status: Yes и X-Yandex-Spam: 4 → spam; X-Yandex-Spam: 1 и X-Spam-Status: No → письмо', async () => {
    expect(classifyInbound(await parse(raw({ 'X-Spam-Status': 'Yes, score=7.1' }, 'x')))).toBe('spam');
    expect(classifyInbound(await parse(raw({ 'X-Yandex-Spam': '4' }, 'x')))).toBe('spam');
    expect(classifyInbound(await parse(raw({ 'X-Yandex-Spam': '1' }, 'x')))).toBe('message');
    expect(classifyInbound(await parse(raw({ 'X-Spam-Status': 'No, score=0.1' }, 'x')))).toBe('message');
  });
});
