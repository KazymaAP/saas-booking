'use client';
// app/[prefix]/[slug]/booking/last/page.tsx — переходник «Моя запись» без аккаунта.
// Читает токен последней записи из localStorage и открывает страницу записи,
// либо экран «Запись не найдена» (порт эталонного MyBooking.tsx).
// Фон сразу тёмный: иначе при переходе на мгновение мелькает белая страница.
import { useEffect } from 'react';

export default function LastBookingPage({ params }: { params: { prefix: string; slug: string } }) {
  const { prefix, slug } = params;

  useEffect(() => {
    let token = '';
    try {
      token = window.localStorage.getItem(`autobooking:last:${slug}`) ?? '';
    } catch {
      token = '';
    }
    const target = token
      ? `/${prefix}/${slug}/booking/my/${encodeURIComponent(token)}`
      : `/${prefix}/${slug}/booking/my/none`;
    window.location.replace(target);
  }, [prefix, slug]);

  return <div style={{ minHeight: '100vh', background: '#000000' }} aria-hidden="true" />;
}
