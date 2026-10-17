'use client';
// _components/CopyButton.tsx — кнопка «Скопировать» с подтверждением для глаз и для диктора.
// Clipboard API есть только в защищённом контексте (https, localhost). В остальных случаях (старый WebView,
// http-домен клиента до выпуска сертификата) — запасной путь через выделение и execCommand('copy').
import { useCallback, useEffect, useState } from 'react';

const COPIED_RESET_MS = 2000;

type CopyState = 'idle' | 'copied' | 'failed';

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Отказ в разрешении — пробуем запасной путь.
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    // Устаревший, но единственный синхронный способ без Clipboard API.
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

// text — строка или функция (если значение собирается в момент клика, например адрес кабинета из window.location).
// label — видимая подпись; describe — что копируем, для aria-label («Скопировать: номер карты»).
export function CopyButton({ text, label = 'Скопировать', describe, className = '' }: {
  text: string | (() => string);
  label?: string;
  describe?: string;
  className?: string;
}) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return undefined;
    const t = setTimeout(() => setState('idle'), COPIED_RESET_MS);
    return () => clearTimeout(t);
  }, [state]);

  const onClick = useCallback(async () => {
    const ok = await copyText(typeof text === 'function' ? text() : text);
    setState(ok ? 'copied' : 'failed');
  }, [text]);

  const visible = state === 'copied' ? 'Скопировано' : state === 'failed' ? 'Не удалось — выделите вручную' : label;
  return (
    <>
      <button type="button" onClick={onClick} aria-label={describe ? `${label}: ${describe}` : undefined} className={`!min-h-[44px] ${className}`}>
        {visible}
      </button>
      <span className="sr-only" aria-live="polite">{state === 'copied' ? 'Скопировано' : state === 'failed' ? 'Не удалось скопировать' : ''}</span>
    </>
  );
}
