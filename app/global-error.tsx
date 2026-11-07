'use client';

// app/global-error.tsx — последняя граница: сбой в самом корневом layout (когда app/error.tsx не сработал).
// Здесь нельзя использовать ничего из приложения (стили, шрифты, компоненты) — только инлайн.
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[global-error]', error.digest ?? '', error.message);
  }, [error]);

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#070b14',
          color: '#f2f6ff',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Сайт временно недоступен</h1>
          <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: '#9fb0cc' }}>
            Произошёл сбой при загрузке страницы. Обновите её через минуту — если не поможет, напишите в поддержку.
          </p>
          {error.digest && (
            <p style={{ marginTop: 10, fontSize: 12, fontFamily: 'monospace', color: '#7d8fae' }}>код: {error.digest}</p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: '10px 20px',
              borderRadius: 999,
              border: 'none',
              background: '#3b82f6',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Обновить
          </button>
        </div>
      </body>
    </html>
  );
}
