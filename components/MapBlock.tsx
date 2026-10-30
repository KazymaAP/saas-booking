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
      // Маркер рисуется inline-SVG (divIcon), а не PNG по умолчанию: стандартная иконка Leaflet при сборке Next часто не находится.
      const pin = L.divIcon({
        className: 'map-pin',
        html: '<svg width="24" height="32" viewBox="0 0 24 32" aria-hidden="true"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="#111111"/><circle cx="12" cy="12" r="4.5" fill="#ffffff"/></svg>',
        iconSize: [24, 32],
        iconAnchor: [12, 32],
        popupAnchor: [0, -32],
      });
      L.marker([lat, lng], { icon: pin, alt: title }).addTo(m).bindPopup(title);
      map = m;
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng, title]);
  return (
    <div
      ref={el}
      // Размеры inline: произвольные классы Tailwind (h-[240px]) строятся только если content конфига включает components/.
      // Без высоты Leaflet рисует карту в нулевом блоке.
      style={{ height: 240, width: '100%', overflow: 'hidden', borderRadius: 16 }}
      aria-label={`Карта: ${title}`}
    />
  );
}
