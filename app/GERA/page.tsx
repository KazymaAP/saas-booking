import type { Metadata } from 'next';
import { GeraTable } from './GeraTable';

export const metadata: Metadata = {
  title: 'GERA — база сервисов',
  description: 'Внутренняя таблица организаций для рассылки.',
  robots: { index: false, follow: false },
};

export default function GeraPage() {
  return <GeraTable />;
}
