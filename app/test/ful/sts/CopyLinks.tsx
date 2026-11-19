'use client';
// app/test/ful/sts/CopyLinks.tsx — держит переходы внутри копии.
//
// Ссылки в кабинетах и на сайтах абсолютные ('/admin/bookings'), а копия живёт под префиксом.
// Без перехвата клик по меню уводил бы на настоящую страницу — то есть ровно то, чего не нужно.
// Перехватываем клик в capture-фазе: Next Link свой обработчик уже не получит.
import { useEffect } from 'react';

const PREFIX = '/test/ful/sts';
const SKIP = ['/_next', '/api/', '/uploads/', '/icons/', '/fonts/'];

function isSkippable(href: string): boolean {
  return href.startsWith('//') || href.startsWith('#') || SKIP.some((p) => href.startsWith(p));
}

export function CopyLinks() {
  useEffect(() => {
    if (!window.location.pathname.startsWith(PREFIX)) return;

    const onClick = (event: MouseEvent) => {
      // Новую вкладку, скачивание и модификаторы не трогаем — пусть работает как обычно.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const link = target?.closest?.('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || !href.startsWith('/') || isSkippable(href)) return;
      if (link.getAttribute('target') && link.getAttribute('target') !== '_self') return;
      if (link.hasAttribute('download')) return;
      // Уже внутри копии — обычный переход.
      if (href === PREFIX || href.startsWith(`${PREFIX}/`)) return;

      event.preventDefault();
      event.stopPropagation();
      window.location.assign(`${PREFIX}${href}`);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
