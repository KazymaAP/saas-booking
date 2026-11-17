// vertical-templates.test.ts — публичный адрес сайта и ниша по умолчанию.
// Регрессии, которые закрывает тест:
//  1) ссылки после оплаты и в админке были с жёстким '/d/', поэтому сайты других ниш открывались по 404;
//  2) бизнес, созданный партнёром или вручную, оставался без vertical_template_id — resolveBusiness
//     не находил нишу и сайт не открывался ни по одному адресу.
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  db: null as unknown as import('./test-utils/supabase-mock').DbMock,
  business: { slug: 'glow', vertical_templates: { url_prefix: 'b' } } as unknown,
  template: { id: 'tpl-d' } as unknown,
}));

vi.mock('./supabase', async () => {
  const { createDbMock, ok } = await import('./test-utils/supabase-mock');
  h.db = createDbMock((q) => {
    if (q.table === 'vertical_templates') return ok(h.template);
    if (q.table === 'businesses') return ok(h.business);
    return ok(null);
  });
  return { adminClient: () => h.db.client };
});

const { DEFAULT_SITE_PREFIX, defaultTemplateId, getBusinessSitePath } = await import('./vertical-templates');

describe('getBusinessSitePath', () => {
  it('берёт префикс из ниши бизнеса, а не хардкод', async () => {
    h.business = { slug: 'glow', vertical_templates: { url_prefix: 'b' } };
    expect(await getBusinessSitePath('id')).toBe('/b/glow');
  });

  it('без ниши отдаёт префикс по умолчанию', async () => {
    h.business = { slug: 'glow', vertical_templates: null };
    expect(await getBusinessSitePath('id')).toBe(`/${DEFAULT_SITE_PREFIX}/glow`);
  });

  it('пустой префикс в шаблоне не даёт ссылку вида //slug', async () => {
    h.business = { slug: 'glow', vertical_templates: { url_prefix: '  ' } };
    expect(await getBusinessSitePath('id')).toBe(`/${DEFAULT_SITE_PREFIX}/glow`);
  });

  it('несуществующий бизнес — null, а не битая ссылка', async () => {
    h.business = null;
    expect(await getBusinessSitePath('id')).toBeNull();
  });
});

describe('defaultTemplateId', () => {
  it('возвращает шаблон ниши по умолчанию', async () => {
    h.template = { id: 'tpl-d' };
    expect(await defaultTemplateId()).toBe('tpl-d');
  });

  it('если шаблона нет — null (бизнес создаётся, но сайт не откроется: это видно в логах)', async () => {
    h.template = null;
    expect(await defaultTemplateId()).toBeNull();
  });
});
