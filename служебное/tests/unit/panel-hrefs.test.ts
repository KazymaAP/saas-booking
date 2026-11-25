// tests/unit/panel-hrefs.test.ts — адреса кабинета внутри раздела копий.
// Раньше в копии (/test/ful/sts/d/vippro/admin) меню вело на настоящие /d/vippro/admin/*: первый клик
// выбрасывал читателя из копии на форму входа реального кабинета, и копия была тупиком.
import { describe, expect, it, vi } from 'vitest';

const copy = vi.hoisted(() => ({ mode: false }));
vi.mock('@/lib/copy-mode', async () => {
  const { COPY_PREFIX } = await import('@/lib/copy-mode-paths');
  return {
    inCopyMode: () => copy.mode,
    copyHref: (path: string) => (path.startsWith(COPY_PREFIX) ? path : `${COPY_PREFIX}${path}`),
    redirectHref: (path: string) => (copy.mode ? (path.startsWith(COPY_PREFIX) ? path : `${COPY_PREFIX}${path}`) : path),
  };
});

const { panelHref, shiftHrefFor, siteHref } = await import(
  '../../../app/[prefix]/[slug]/admin/(protected)/_lib/hrefs'
);

const params = { prefix: 'd', slug: 'vippro' };

describe('адреса кабинета', () => {
  it('в обычном режиме — без префикса копии', () => {
    copy.mode = false;
    expect(panelHref(params)).toBe('/d/vippro/admin');
    expect(siteHref(params)).toBe('/d/vippro');
    expect(shiftHrefFor('manager', params)).toBe('/d/vippro/manager');
  });

  it('в копии — всё остаётся внутри /test/ful/sts', () => {
    copy.mode = true;
    expect(panelHref(params)).toBe('/test/ful/sts/d/vippro/admin');
    expect(siteHref(params)).toBe('/test/ful/sts/d/vippro');
    expect(shiftHrefFor('receptionist', params)).toBe('/test/ful/sts/d/vippro/receptionist');
  });

  it('«Моя смена» не появляется у ролей, которым она не положена', () => {
    copy.mode = true;
    expect(shiftHrefFor('owner', params)).toBeNull();
    expect(shiftHrefFor(null, params)).toBeNull();
  });
});
