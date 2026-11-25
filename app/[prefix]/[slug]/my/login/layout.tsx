// app/[prefix]/[slug]/my/login/layout.tsx — метаданные входа клиента.
// Сама страница — клиентский компонент, экспортировать metadata из него нельзя.
// Без этого файла вход в /my наследовал заголовок корневого макета и попадал в индекс
// как «Онлайн-запись» — дубль главной на каждом сайте бизнеса.
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Вход в личный кабинет',
  robots: { index: false, follow: false },
};

export default function CustomerLoginLayout({ children }: { children: ReactNode }) {
  return children;
}
