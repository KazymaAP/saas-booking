// app/[prefix]/[slug]/admin/(protected)/_lib/hrefs.ts — адреса кабинета с учётом раздела копий.
//
// Зачем отдельный модуль: panelBase() в sections.ts — чистый (его использует и клиентское меню),
// а привязка к заголовкам запроса живёт в copy-mode.ts и тянет next/headers. Смешав их, мы сломали бы
// сборку клиентских компонентов. Здесь — только серверная обёртка.
//
// Что чинит: в копии (/test/ful/sts/d/vippro/admin) меню вело на настоящие /d/vippro/admin/*, то есть
// первый же клик выбрасывал читателя из копии на форму входа реального кабинета. Копия была тупиком:
// открыть можно было ровно ту страницу, чей адрес набрали руками.
import { redirectHref } from '@/lib/copy-mode';
import { panelBase, shiftHref, type PanelParams } from './sections';

/** Корень кабинета: '/d/slug/admin' в обычном режиме, '/test/ful/sts/d/slug/admin' в копии. */
export function panelHref(params: PanelParams): string {
  return redirectHref(panelBase(params));
}

/** Ссылка «Моя смена» (только сотрудникам), тоже внутри копии. */
export function shiftHrefFor(role: string | null, params: PanelParams): string | null {
  const href = shiftHref(role, params);
  return href ? redirectHref(href) : null;
}

/** Публичная витрина бизнеса: ссылка «Открыть сайт» из кабинета. */
export function siteHref(params: PanelParams): string {
  return redirectHref(`/${params.prefix}/${params.slug}`);
}
