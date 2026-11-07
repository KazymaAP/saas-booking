-- 0015_glowdetailing_demo.sql — демо-тенант детейлинга «GlowDetailing».
--
-- Источник данных: проект D:\Clode\Детейленг (src/instance.ts, public/media/demo/*).
-- Перенесено: бренд, 5 услуг с ценами и длительностью, график работы, контакты,
-- рейтинг, правила брони, 3 фотографии. Исходная папка «Детейленг» не изменялась —
-- фото скопированы в public/media/glowdetailing/.
--
-- Тенант публикуется как status='client' + subscription_active=true, иначе
-- lib/business.ts (resolveBusiness) не отдаёт публичный сайт. Доступен по адресу
-- /d/glowdetailing (url_prefix='d' у шаблона «Детейлинг»).
--
-- Идемпотентно: повторный запуск ничего не дублирует. Транзакция целиком.
begin;

do $$
declare
  v_tmpl uuid;
  v_biz  uuid;
begin
  select id into v_tmpl
    from public.vertical_templates
   where url_prefix = 'd' and slug = 'detailing';

  if v_tmpl is null then
    raise notice 'GlowDetailing: шаблон detailing (url_prefix=d) не найден — пропуск (нужна 0003_seed.sql)';
    return;
  end if;

  insert into public.businesses (
    slug, name, description, vertical_template_id, category,
    address, city, region,
    working_hours, slot_step_minutes, cancel_hours_before, min_hours_before, max_days_ahead, auto_confirm,
    phones, emails, websites, socials, rating, reviews_count,
    brand_color, status, plan, subscription_active, subscription_until, subscription_started_at,
    custom_texts, custom_blocks, onboarding_completed_at
  ) values (
    'glowdetailing',
    'GlowDetailing',
    'Детейлинг премиум-класса: полировка, химчистка и защита кузова. Работаем с каждой машиной как со своей.',
    v_tmpl,
    'Детейлинг',
    'ул. Промышленная, 14, стр. 2',
    'Москва',
    'Москва',
    '{
      "mon": [{"open":"09:00","close":"21:00"}],
      "tue": [{"open":"09:00","close":"21:00"}],
      "wed": [{"open":"09:00","close":"21:00"}],
      "thu": [{"open":"09:00","close":"21:00"}],
      "fri": [{"open":"09:00","close":"21:00"}],
      "sat": [{"open":"10:00","close":"20:00"}],
      "sun": [{"open":"10:00","close":"18:00"}]
    }'::jsonb,
    30,   -- slot_step_minutes: сетка 30 минут (как в Детейленг)
    24,   -- cancel_hours_before: бесплатная отмена за 24 ч
    1,    -- min_hours_before: запись не позже чем за 60 минут (1 ч)
    30,   -- max_days_ahead: окно записи 30 дней
    true, -- auto_confirm: requireConfirmation=false → подтверждение не требуется
    array['+7 495 120-45-67'],
    array['demo@glowdetailing.ru'],
    array[]::text[],
    null,
    4.9,
    230,
    '#4690ff',
    'client',
    'basic',
    true,
    '2030-01-01',
    now(),
    jsonb_build_object(
      'hero_title', 'Детейлинг премиум-класса',
      'hero_subtitle', 'Полировка, химчистка и защита кузова. Работаем с каждой машиной как со своей.',
      'about', 'GlowDetailing — студия детейлинга премиум-класса. Полировка кузова, глубокая химчистка салона, керамические покрытия и антигравийная плёнка. Гарантия 14 дней на работы, собственная премиум-химия, запись онлайн за минуту.'
    ),
    jsonb_build_object('show_map', false, 'show_gallery', true, 'show_reviews', true),
    now()
  )
  on conflict (slug) do nothing;

  select id into v_biz from public.businesses where slug = 'glowdetailing';
  if v_biz is null then
    raise notice 'GlowDetailing: бизнес не создан и не найден — пропуск';
    return;
  end if;

  -- Услуги: 5 позиций из конфига GlowDetailing (src/instance.ts).
  if not exists (select 1 from public.services where business_id = v_biz) then
    insert into public.services (business_id, name, description, price, duration_minutes, sort_order, is_active) values
      (v_biz, 'Комплексная мойка',    'Бесконтактная мойка, сушка, очистка арок и дисков.', 1500,  60, 1, true),
      (v_biz, 'Химчистка салона',     'Глубокая чистка кресел, потолка и ковров.',          4500, 180, 2, true),
      (v_biz, 'Полировка кузова',     'Удаление вмятин-паутинок, восстановление блеска.',    9000, 240, 3, true),
      (v_biz, 'Запечатка воском',     'Защитное покрытие кузова на 6 месяцев.',             6000, 180, 4, true),
      (v_biz, 'Антигравийная плёнка', 'Защита бампера и капота от сколов.',                 7000, 120, 5, true);
  end if;

  -- Фото: первая запись — hero-фото (StudioTemplate берёт photos[0]), остальные — галерея.
  if not exists (select 1 from public.photos where business_id = v_biz) then
    insert into public.photos (business_id, url, alt, sort_order) values
      (v_biz, '/media/glowdetailing/hero.jpg',          'Общий вид после детейлинга',      0),
      (v_biz, '/media/glowdetailing/gallery-wash.jpg',  'Комплексная мойка Porsche 911',   1),
      (v_biz, '/media/glowdetailing/gallery-coupe.jpg', 'Полировка кузова BMW M4',         2);
  end if;

  raise notice 'GlowDetailing: демо-тенант готов (id=%)', v_biz;
end $$;

commit;
