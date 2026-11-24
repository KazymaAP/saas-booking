'use client';

// общие/lib/use-focus-trap.ts — удержание фокуса внутри модального окна.
//
// Зачем: у шторки записи был role="dialog" aria-modal="true", но фокус оставался на кнопке
// за шторкой, и Tab уводил в страницу под ней — с клавиатуры до формы записи было не добраться.
// aria-modal сам по себе не ловит фокус, нужен обработчик Tab и явный перенос фокуса.
//
// Что делает:
//   ▸ при открытии ставит фокус на initialFocus (или на первый доступный элемент, или на контейнер);
//   ▸ Tab/Shift+Tab ходят по кругу внутри контейнера, включая случай «фокус на контейнере»;
//   ▸ Escape закрывает;
//   ▸ при закрытии возвращает фокус туда, откуда окно открыли.
import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';

// Видимые и доступные элементы внутри окна. Список пересобирается на каждое нажатие Tab:
// между шагами мастера состав полей меняется.
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function isVisible(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
  return el.getClientRects().length > 0;
}

export type FocusTrapOptions = {
  // Селектор элемента, который получает фокус при открытии.
  initialFocus?: string;
  // Поставить фокус на само окно: диктор прочитает заголовок, дальше Tab ведёт внутрь.
  // Для мастеров из нескольких шагов это лучше, чем сразу прыгать на кнопку.
  focusContainer?: boolean;
  // Escape закрывает. Выключают там, где закрытие должен обрабатывать свой обработчик
  // (например, чтобы не закрыть шторку во время отправки формы).
  closeOnEscape?: boolean;
  // Вернуть фокус на элемент, с которого открыли. По умолчанию true.
  restoreFocus?: boolean;
  enabled?: boolean;
};

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(onClose: () => void, options: FocusTrapOptions = {}) {
  const { initialFocus, focusContainer = false, closeOnEscape = true, restoreFocus = true, enabled = true } = options;
  const ref = useRef<T | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const container = ref.current;
    if (container === null) return undefined;

    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Кадр ожидания: шторка ещё получает классы анимации, до неё может не быть размеров.
    const frame = window.requestAnimationFrame(() => {
      const preferred = initialFocus ? container.querySelector<HTMLElement>(initialFocus) : null;
      const first = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).find(isVisible);
      const target = focusContainer ? container : (preferred ?? first ?? container);
      target.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (!restoreFocus) return;
      const target = returnTo.current;
      // Элемент мог исчезнуть из DOM (например, шторку открыли из списка, который перерисовался).
      if (target !== null && target.isConnected) target.focus();
    };
  }, [enabled, initialFocus, focusContainer, restoreFocus]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape') {
        if (!closeOnEscape) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const container = ref.current;
      if (container === null) return;

      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        // С контейнера назад — сразу на последний элемент, иначе фокус уйдёт за окно.
        if (active === first || active === container) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose, closeOnEscape],
  );

  return { ref, onKeyDown };
}
