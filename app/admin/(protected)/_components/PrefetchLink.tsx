'use client';
// Ссылка с prefetch при наведении/фокусе (промт агента 7: «prefetch при hover на карточку»).
// Автоматический prefetch по viewport выключен: в таблице 50 строк — это 50 лишних запросов страницы.
// При hover/focus/touch загружаем полный RSC-payload карточки: переход открывается мгновенно.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

type Props = Omit<React.ComponentProps<typeof Link>, 'href' | 'prefetch'> & { href: string };

export function PrefetchLink({ href, children, ...rest }: Props) {
  const router = useRouter();
  const warm = useCallback(() => router.prefetch(href), [router, href]);
  return (
    <Link href={href} prefetch={false} onMouseEnter={warm} onFocus={warm} onTouchStart={warm} {...rest}>
      {children}
    </Link>
  );
}
