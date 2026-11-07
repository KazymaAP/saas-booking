// lib/__fixtures__/mail.ts — сырые письма RFC 5322 для тестов разбора входящих (ответ, DSN-bounce).

const CRLF = '\r\n';

export function raw(headers: Record<string, string>, body: string): string {
  const base: Record<string, string> = {
    From: 'Иван <ivan@koleso.ru>', To: 'sales@zapishisya.ru', Subject: 'Re: Сайт', 'Message-ID': '<r1@koleso.ru>',
    Date: 'Thu, 15 Oct 2026 10:00:00 +0300', 'MIME-Version': '1.0', 'Content-Type': 'text/plain; charset=utf-8', ...headers,
  };
  return `${Object.entries(base).map(([k, v]) => `${k}: ${v}`).join(CRLF)}${CRLF}${CRLF}${body}`;
}

export function dsn(recipient: string, status: string, diagnostic: string, originalId = '<orig@zapishisya.ru>'): string {
  const b = 'BOUNDARY';
  return [
    'From: MAILER-DAEMON@yandex.ru', 'To: sales@zapishisya.ru', 'Subject: Undelivered Mail Returned to Sender',
    'Message-ID: <dsn1@yandex.ru>', 'MIME-Version: 1.0', `Content-Type: multipart/report; report-type=delivery-status; boundary="${b}"`, '',
    `--${b}`, 'Content-Type: text/plain; charset=utf-8', '', 'Письмо не доставлено.', '',
    `--${b}`, 'Content-Type: message/delivery-status', '',
    'Reporting-MTA: dns; mx.yandex.ru', '', `Final-Recipient: rfc822; ${recipient}`, 'Action: failed', `Status: ${status}`,
    `Diagnostic-Code: smtp; ${diagnostic}`, '',
    `--${b}`, 'Content-Type: text/rfc822-headers', '', `Message-ID: ${originalId}`, `To: ${recipient}`, 'Subject: Сайт', '',
    `--${b}--`, '',
  ].join(CRLF);
}

