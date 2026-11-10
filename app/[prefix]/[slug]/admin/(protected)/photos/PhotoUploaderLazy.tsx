'use client';
// photos/PhotoUploaderLazy.tsx — загрузчик подгружается отдельным чанком только у владельца:
// менеджер (просмотр) не скачивает код выбора и сжатия фото. Сжатие внутри ещё и само грузится по требованию.
import dynamic from 'next/dynamic';

export const PhotoUploaderLazy = dynamic(() => import('./PhotoUploader').then((m) => m.PhotoUploader), {
  ssr: false,
  // Заглушка той же высоты, что форма: страница не прыгает при подгрузке.
  loading: () => <div className="h-[150px] max-w-[560px] animate-pulse rounded-lg bg-[#f0f0f0]" aria-hidden="true" />,
});
