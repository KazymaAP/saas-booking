'use client';
// Кнопка «Пересчитать» статистики: server action, тост с результатом, без перезагрузки страницы.
import { ActionForm, SubmitButton } from '@/главная/components/ActionForm';
import { refreshStats } from './actions';

export function RefreshButton({ period }: { period: number }) {
  return (
    <ActionForm action={refreshStats} label="Пересчитать статистику">
      <input type="hidden" name="period" value={period} />
      <SubmitButton variant="secondary" pendingText="Считаю…">Пересчитать</SubmitButton>
    </ActionForm>
  );
}
