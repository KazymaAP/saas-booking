'use client';
// components/CookieSettingsButton.tsx — кнопка «Настройки cookie» для футеров: повторно открывает настройки баннера
// (право изменить или отозвать выбор). Отдельный крошечный модуль, чтобы сам баннер оставался ленивым чанком.
// 'use client': обработчик клика.
import { useCallback } from 'react';
import { COOKIE_SETTINGS_EVENT } from '@/lib/legal-versions';

export function CookieSettingsButton({ className }: { className?: string }) {
  const open = useCallback(() => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT)), []);
  return (
    <button type="button" onClick={open} className={className ?? 'underline'} data-testid="cookie-settings-open">
      Настройки cookie
    </button>
  );
}
