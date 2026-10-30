'use client';
// components/MapLazy.tsx — карта подгружается только в браузере и только когда нужна (ТЗ §5.1, оптимизация).
import dynamic from 'next/dynamic';

export const MapLazy = dynamic(() => import('./MapBlock').then((m) => m.MapBlock), {
  ssr: false,
  loading: () => <div style={{ height: 240, width: '100%', borderRadius: 16, background: '#f2f2f2' }} aria-hidden />,
});
