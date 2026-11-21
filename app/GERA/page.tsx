import type { Metadata } from 'next';

import { GeraTable } from './GeraTable';

export const metadata: Metadata = {
  title: 'GERA — база сервисов',
  description: 'Внутренняя таблица организаций для рассылки.',
  robots: { index: false, follow: false },
};

// Страница открыта всем по прямому запросу владельца: пароль снят.
// Из поиска её по-прежнему выводит robots.txt и noindex выше — база лидов
// с телефонами не должна попадать в выдачу, но по ссылке заходит любой.
export default function GeraPage() {
  return <GeraTable />;
}
