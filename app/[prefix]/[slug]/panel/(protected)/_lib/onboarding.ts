// _lib/onboarding.ts — чек-лист готовности сайта (ТЗ §13.13, §19.1): 4 пункта по 25%.
// Чистая функция: на вход — факты о бизнесе, на выход — пункты и процент. Покрыта тестами.
import { hasWorkingDays } from '@/lib/hours';
import type { Business } from '@/lib/database.types';

export type ChecklistItem = { key: 'services' | 'photos' | 'contacts' | 'hours'; label: string; hint: string; path: string; done: boolean };

export type OnboardingFacts = {
  activeServices: number;
  photos: number;
  business: Pick<Business, 'address' | 'phones' | 'working_hours'>;
};

export function buildChecklist(f: OnboardingFacts): ChecklistItem[] {
  return [
    { key: 'services', label: 'Услуги и цены', hint: 'Добавьте хотя бы одну услугу', path: 'services', done: f.activeServices > 0 },
    { key: 'photos', label: 'Фото работ', hint: 'Загрузите фото, чтобы клиенты видели результат', path: 'photos', done: f.photos > 0 },
    {
      key: 'contacts',
      label: 'Контакты и адрес',
      hint: 'Укажите адрес и телефон',
      path: 'settings',
      done: Boolean(f.business.address?.trim()) && (f.business.phones?.length ?? 0) > 0,
    },
    { key: 'hours', label: 'Рабочее время', hint: 'Без рабочего времени запись недоступна', path: 'settings', done: hasWorkingDays(f.business.working_hours) },
  ];
}

export function progressPercent(items: ChecklistItem[]): number {
  if (items.length === 0) return 100;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}
