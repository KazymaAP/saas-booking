// общие/lib/copy-mode-paths.test.ts — какие адреса копий обслуживает собственный маршрут.
// Ошибка здесь стоит дорого: лишний true уводит запрос из rewrite (кабинет копии перестал бы
// маскировать контакты), лишний false возвращает расхождение гидрации на витрине.
import { describe, expect, it } from 'vitest';
import { hasOwnCopyRoute } from './copy-mode-paths';

describe('hasOwnCopyRoute', () => {
  it('витрина бизнеса — свой маршрут', () => {
    expect(hasOwnCopyRoute('/d/vippro')).toBe(true);
    expect(hasOwnCopyRoute('/d/2bro')).toBe(true);
    expect(hasOwnCopyRoute('/b/some-slug')).toBe(true);
  });

  it('GERA — свой маршрут', () => {
    expect(hasOwnCopyRoute('/GERA')).toBe(true);
  });

  it('вложенные разделы кабинета остаются на rewrite', () => {
    expect(hasOwnCopyRoute('/d/vippro/admin')).toBe(false);
    expect(hasOwnCopyRoute('/d/vippro/admin/services')).toBe(false);
    expect(hasOwnCopyRoute('/d/vippro/receptionist')).toBe(false);
    expect(hasOwnCopyRoute('/d/vippro/my')).toBe(false);
  });

  it('односегментные страницы остаются на rewrite', () => {
    expect(hasOwnCopyRoute('/oferta')).toBe(false);
    expect(hasOwnCopyRoute('/privacy')).toBe(false);
    expect(hasOwnCopyRoute('/')).toBe(false);
  });

  it('API под префиксом копий никогда не считается своим маршрутом', () => {
    expect(hasOwnCopyRoute('/api')).toBe(false);
    expect(hasOwnCopyRoute('/api/export')).toBe(false);
    expect(hasOwnCopyRoute('/api/export/businesses')).toBe(false);
  });

  it('длинный префикс не подходит под шаблон витрины', () => {
    expect(hasOwnCopyRoute('/toolong/slug')).toBe(false);
    expect(hasOwnCopyRoute('/D/vippro')).toBe(false);
  });

  it('служебные разделы со вторым сегментом остаются на rewrite', () => {
    expect(hasOwnCopyRoute('/pay/abc123')).toBe(false);
    expect(hasOwnCopyRoute('/preview/vippro')).toBe(false);
    expect(hasOwnCopyRoute('/invite/token')).toBe(false);
    expect(hasOwnCopyRoute('/partner/demo')).toBe(false);
  });
});
