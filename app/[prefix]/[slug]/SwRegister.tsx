'use client';
// Регистрация service worker для PWA (ТЗ §5.1). Вызывается на публичных страницах сайта.
import { useEffect } from 'react';

export function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return null;
}
