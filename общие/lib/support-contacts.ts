// lib/support-contacts.ts — контакты поддержки из NEXT_PUBLIC_SUPPORT_EMAIL / NEXT_PUBLIC_SUPPORT_TELEGRAM.
// Один источник для страницы блокировки и подвала лендинга: до этого логика жила только в app/blocked,
// а лендинг показывал пустой блок реквизитов и обещание «напишите нам» без единого адреса.

export type SupportContact = { href: string; label: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TG_RE = /^[A-Za-z0-9_]{5,32}$/;

/** Email поддержки или null, если переменная пустая/битая. */
export function supportEmail(): string | null {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  return email && EMAIL_RE.test(email) ? email : null;
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
