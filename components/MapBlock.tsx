'use client';
// components/MapBlock.tsx — карта Leaflet + OpenStreetMap с маркером (ТЗ §5.1). Загружается только в браузере.
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export function MapBlock({ lat, lng, title }: { lat: number; lng: number; title: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el.current) return;
      const m = L.map(el.current, { scrollWheelZoom: false }).setView([lat, lng], 16);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(m);
      L.marker([lat, lng]).addTo(m).bindPopup(title);
      map = m;
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng, title]);
  return <div ref={el} className="h-[240px] w-full overflow-hidden rounded-2xl" aria-label={`Карта: ${title}`} />;
}
