// lib/support-contacts.ts — контакты поддержки из NEXT_PUBLIC_SUPPORT_EMAIL / NEXT_PUBLIC_SUPPORT_TELEGRAM.
// Один источник для страницы блокировки и подвала лендинга: до этого логика жила только в app/blocked,
// а лендинг показывал пустой блок реквизитов и обещание «напишите нам» без единого адреса.

export type SupportContact = { href: string; label: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TG_RE = /^[A-Za-z0-9_]{5,32}$/;
// example.com/net/org — зарезервированные домены для документации (RFC 2606). В .env.local
// лежат именно такие плейсхолдеры; если их показать в подвале, клиент напишет в никуда.
const PLACEHOLDER_EMAIL_RE = /@example\.(com|net|org)$/i;

/** Email поддержки или null, если переменная пустая, битая или это плейсхолдер. */
export function supportEmail(): string | null {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  if (!email || !EMAIL_RE.test(email) || PLACEHOLDER_EMAIL_RE.test(email)) return null;
  return email;
}

/** Ник Telegram без ведущей «@» или null. */
export function supportTelegram(): string | null {
  const tg = process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM?.trim().replace(/^@/, '');
  return tg && TG_RE.test(tg) ? tg : null;
}

/** Готовые ссылки для рендера. Пустой массив — контакты не настроены. */
export function supportContacts(subject = 'Заявка с сайта'): SupportContact[] {
  const out: SupportContact[] = [];
  const email = supportEmail();
  const tg = supportTelegram();
  if (email) out.push({ href: `mailto:${email}?subject=${encodeURIComponent(subject)}`, label: email });
  if (tg) out.push({ href: `https://t.me/${tg}`, label: `Telegram @${tg}` });
  return out;
}
