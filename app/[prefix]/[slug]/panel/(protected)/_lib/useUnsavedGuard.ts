'use client';
// _lib/useUnsavedGuard.ts — предупреждение браузера при уходе со страницы с несохранёнными изменениями.
// Владелец заполняет длинную форму настроек с телефона: случайный свайп «назад» или закрытие вкладки
// не должны молча терять ввод. Срабатывает на перезагрузку/закрытие/внешний переход (beforeunload).
// Переходы внутри кабинета через <Link> beforeunload не вызывают — это ограничение App Router, в нём нет
// перехвата клиентской навигации; кнопка «Сохранить» активна, пока есть изменения, — это второй сигнал.
import { useEffect } from 'react';

export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Старые Safari/Chrome показывают диалог только при непустом returnValue; текст браузер всё равно заменит своим.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}
