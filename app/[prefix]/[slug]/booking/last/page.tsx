'use client';
// app/[prefix]/[slug]/booking/last/page.tsx — аналог эталонной кнопки «Моя запись».
// Берёт токен последней записи из localStorage и открывает страницу управления ею.
// Никакого аккаунта и входа не требуется: токен живёт только в браузере клиента.
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
      router.replace(`/${prefix}/${slug}/booking/cancel/${encodeURIComponent(token)}`);
    } else {
      // Записи ещё нет — открываем шторку записи на главной, как в эталоне.
      router.replace(`/${prefix}/${slug}?book=1`);
    }
  }, [prefix, slug, router]);

  return (
    <main className="mx-auto max-w-[520px] px-4 py-10">
      <h1 className="text-[24px] font-semibold">Моя запись</h1>
      <p className="mt-4 text-[15px] text-[#595959]">Загружаем вашу запись…</p>
    </main>
  );
}
