'use client';
// app/[prefix]/[slug]/booking/last/page.tsx — переходник «Моя запись» без аккаунта.
// Читает токен последней записи из localStorage и открывает страницу записи,
// либо экран «Запись не найдена» (порт эталонного MyBooking.tsx).
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LastBookingPage({ params }: { params: { prefix: string; slug: string } }) {
  const router = useRouter();
  const { prefix, slug } = params;

  useEffect(() => {
    let token = '';
    try {
      token = window.localStorage.getItem(`autobooking:last:${slug}`) ?? '';
    } catch {
      token = '';
    }
    if (token) {
      router.replace(`/${prefix}/${slug}/booking/my/${encodeURIComponent(token)}`);
    } else {
      // Нет последней записи — показываем экран «Запись не найдена» из эталона.
      router.replace(`/${prefix}/${slug}/booking/my/none`);
    }
  }, [prefix, slug, router]);

  return (
    <main className="mx-auto max-w-[520px] px-4 py-10">
      <h1 className="text-[24px] font-semibold">Моя запись</h1>
      <p className="mt-4 text-[15px] text-[#595959]">Загружаем вашу запись…</p>
    </main>
  );
}
