// app/layout.tsx — корневой макет. brand_color передаётся через CSS-переменную --brand-color (ТЗ §47).
import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Онлайн-запись' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-white text-[#1a1a1a] antialiased">{children}</body>
    </html>
  );
}
