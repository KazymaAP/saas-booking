// app/blocked/page.tsx — заглушка: лицензия заблокирована вручную или срок поддержки истёк (ТЗ 4.0 §3.4 п.6, §14.4, §14.6).
// Middleware переписывает сюда при license_status=blocked. Страница статична, не ходит в БД и не раскрывает причину.
// Контакт поддержки: NEXT_PUBLIC_SUPPORT_EMAIL / NEXT_PUBLIC_SUPPORT_TELEGRAM, иначе адрес сервиса (lib/site.ts).
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Сайт временно недоступен',
  robots: { index: false, follow: false },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TG_RE = /^[A-Za-z0-9_]{5,32}$/;

type Contact = { href: string; label: string };

function supportContacts(): Contact[] {
  const out: Contact[] = [];
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  const tg = process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM?.trim().replace(/^@/, '');
  if (email && EMAIL_RE.test(email)) out.push({ href: `mailto:${email}?subject=${encodeURIComponent('Сайт недоступен')}`, label: email });
  if (tg && TG_RE.test(tg)) out.push({ href: `https://t.me/${tg}`, label: `Telegram @${tg}` });
  if (out.length === 0) out.push({ href: SITE_URL, label: SITE_URL.replace(/^https?:\/\//, '') });
  return out;
}

export default function Blocked() {
  const contacts = supportContacts();
  return (
    <main id="blocked-page" className="mx-auto grid min-h-[70vh] max-w-[520px] content-center gap-4 px-4 py-16">
      <h1 className="text-[24px] font-semibold">Сайт временно недоступен</h1>
      <p className="text-[#666666]">
        Онлайн-запись на этом сайте приостановлена. Если вы клиент студии — свяжитесь с ней по телефону.
      </p>
      <section aria-labelledby="support-title" className="grid gap-2 rounded-md border border-[#e5e5e5] p-4">
        <h2 id="support-title" className="text-[16px] font-semibold">Вы владелец сайта?</h2>
        <p className="text-[14px] text-[#666666]">Напишите в поддержку — поможем восстановить работу.</p>
        <ul className="grid gap-1 text-[14px]">
          {contacts.map((c) => (
            <li key={c.href}>
              <a className="underline" href={c.href} rel="noopener noreferrer">{c.label}</a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
