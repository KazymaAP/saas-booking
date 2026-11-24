'use client';

// общие/components/TitleSync.tsx — выставляет document.title после гидрации.
//
// Зачем: metadata из not-found.tsx попадает в серверный HTML, но при гидрации Next
// перезаписывает заголовок заголовком layout — вкладка на 404 показывала «Онлайн-запись».
// Метаданные обычных страниц (generateMetadata) в дереве маршрута и переживают гидрацию,
// поэтому костыль нужен только там, где метаданные теряются.
import { useEffect } from 'react';

export function TitleSync({ title }: { title: string }) {
  useEffect(() => {
    if (document.title !== title) document.title = title;
  }, [title]);
  return null;
}
