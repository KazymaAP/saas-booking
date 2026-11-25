// lib/public-revalidate.ts — сброс кэша публичной витрины бизнеса после правки данных.
//
// Витрина пререндерится (generateStaticParams + revalidate=3600), поэтому после правки
// нужно сбрасывать КОНКРЕТНЫЙ путь. Вариант revalidatePath('/[prefix]/[slug]', 'page')
// не работает: функция превращает аргумент в тег `_N_T_<путь>/<тип>` и кладёт его в
// revalidatedTags (next/dist/server/web/spec-extension/revalidate.js), а тег с шаблоном
// не совпадает ни с одной готовой страницей. Поэтому путь собираем из настоящего
// префикса ниши.
import { revalidatePath } from 'next/cache';
import { ownerPanelInfo } from './owner-session';

export async function revalidatePublicSite(slug: string): Promise<void> {
  const info = await ownerPanelInfo(slug);
  // Бизнес без ниши публичной страницы не имеет — сбрасывать нечего.
  if (!info) return;
  revalidatePath(`/${info.canonicalPrefix}/${slug}`, 'page');
}
