-- 0003_seed.sql - 11 ниш из ТЗ §14 и bucket для фото и логотипов (§45).
-- Идемпотентно: повторный запуск ничего не дублирует.
-- Длительности (мин) не заданы в ТЗ: выбраны разумные значения, владелец может поменять в кабинете.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('logos', 'logos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

insert into vertical_templates (name, slug, icon, url_prefix, description, fields, default_services, default_texts, default_colors, blocks, show_demo_mode, is_active)
values
('Шиномонтаж', 'tire-service', '🛞', 't', 'Шиномонтаж и сезонная замена шин', '["размер колёс","сезонность"]',
 '[{"name":"R13-15","price":1500,"duration":60},{"name":"R16-18","price":2000,"duration":60},{"name":"R19+","price":2500,"duration":90},{"name":"Балансировка","price":300,"duration":30},{"name":"Азот","price":400,"duration":30},{"name":"Ремонт прокола","price":500,"duration":30},{"name":"Хранение шин","price":3000,"duration":30},{"name":"Выезд","price":3000,"duration":60}]',
 '{"hero_title":"{name} — онлайн-запись","hero_subtitle":"Запишитесь онлайн за 30 секунд. Без звонков.","cta":"Записаться"}',
 '{"primary":"#111111","secondary":"#f5f5f5","bg":"#ffffff"}',
 '{"show_map":true,"show_gallery":true,"show_reviews":false}', true, true),

('Детейлинг', 'detailing', '✨', 'd', 'Мойка, химчистка, полировка, керамика', '["тип кузова"]',
 '[{"name":"Полировка","price":5000,"duration":480},{"name":"Керамическое покрытие","price":15000,"duration":720},{"name":"Химчистка","price":8000,"duration":240},{"name":"Мойка","price":800,"duration":60}]',
 '{"hero_title":"{name} — онлайн-запись","hero_subtitle":"Запишитесь онлайн за 30 секунд. Без звонков.","cta":"Записаться"}',
 '{"primary":"#111111","secondary":"#f5f5f5","bg":"#ffffff"}',
 '{"show_map":true,"show_gallery":true,"show_reviews":false}', true, true),

('Маникюр', 'manicure', '💅', 'm', 'Маникюр, педикюр, наращивание', '["мастер","покрытие"]',
 '[{"name":"Классический маникюр","price":1500,"duration":60},{"name":"Гель-лак","price":2000,"duration":90},{"name":"Наращивание","price":3500,"duration":150},{"name":"Дизайн","price":500,"duration":15},{"name":"Педикюр","price":2500,"duration":60}]',
 '{"hero_title":"{name} — онлайн-запись","hero_subtitle":"Запишитесь онлайн за 30 секунд. Без звонков.","cta":"Записаться"}',
 '{"primary":"#111111","secondary":"#f5f5f5","bg":"#ffffff"}',
 '{"show_map":true,"show_gallery":true,"show_reviews":false}', true, true),

('Сауна / баня', 'sauna', '♨️', 'sa', 'Аренда сауны и бани', '["вместимость"]',
 '[{"name":"Час","price":1500,"duration":60},{"name":"2 часа","price":2500,"duration":120},{"name":"Веник","price":500,"duration":30},{"name":"Доп. гость","price":300,"duration":30}]',
 '{"hero_title":"{name} — онлайн-запись","hero_subtitle":"Запишитесь онлайн за 30 секунд. Без звонков.","cta":"Записаться"}',
 '{"primary":"#111111","secondary":"#f5f5f5","bg":"#ffffff"}',
 '{"show_map":true,"show_gallery":true,"show_reviews":false}', true, true),

('Барбершоп', 'barbershop', '💈', 'b', 'Стрижки и уход за бородой', '["мастер"]',
 '[{"name":"Стрижка","price":1500,"duration":60},{"name":"Борода","price":1000,"duration":30},{"name":"Комплекс","price":2000,"duration":90},{"name":"Детская стрижка","price":800,"duration":30}]',
 '{"hero_title":"{name} — онлайн-запись","hero_subtitle":"Запишитесь онлайн за 30 секунд. Без звонков.","cta":"Записаться"}',
 '{"primary":"#111111","secondary":"#f5f5f5","bg":"#ffffff"}',
 '{"show_map":true,"show_gallery":true,"show_reviews":false}', true, true),

('Автосервис', 'auto-service', '🔧', 'av', 'Диагностика, ТО, ремонт', '["марка авто"]',
 '[{"name":"Диагностика","price":1000,"duration":60},{"name":"Замена масла","price":1500,"duration":60},{"name":"ТО","price":5000,"duration":240},{"name":"Шиномонтаж","price":2000,"duration":60}]',
 '{"hero_title":"{name} — онлайн-запись","hero_subtitle":"Запишитесь онлайн за 30 секунд. Без звонков.","cta":"Записаться"}',
 '{"primary":"#111111","secondary":"#f5f5f5","bg":"#ffffff"}',
 '{"show_map":true,"show_gallery":true,"show_reviews":false}', true, true),

('Фотограф', 'photographer', '📷', 'p', 'Фотосессии и съёмка мероприятий', '["пакет"]',
 '[{"name":"Часовая съёмка","price":5000,"duration":60},{"name":"Свадебная съёмка","price":30000,"duration":480},{"name":"Портрет","price":3000,"duration":60}]',
 '{"hero_title":"{name} — онлайн-запись","hero_subtitle":"Запишитесь онлайн за 30 секунд. Без звонков.","cta":"Записаться"}',
 '{"primary":"#111111","secondary":"#f5f5f5","bg":"#ffffff"}',
 '{"show_map":true,"show_gallery":true,"show_reviews":false}', true, true),

('Репетитор', 'tutor', '📚', 'r', 'Индивидуальные занятия', '["предмет"]',
 '[{"name":"Занятие 1 час","price":1500,"duration":60},{"name":"Пакет 5 занятий","price":6000,"duration":60},{"name":"Пакет 10 занятий","price":11000,"duration":60}]',
 '{"hero_title":"{name} — онлайн-запись","hero_subtitle":"Запишитесь онлайн за 30 секунд. Без звонков.","cta":"Записаться"}',
 '{"primary":"#111111","secondary":"#f5f5f5","bg":"#ffffff"}',
 '{"show_map":true,"show_gallery":false,"show_reviews":false}', true, true),

('Клининг', 'cleaning', '🧹', 'c', 'Уборка квартир, домов и офисов', '["площадь"]',
 '[{"name":"Уборка квартиры","price":3000,"duration":180},{"name":"Уборка дома","price":6000,"duration":240},{"name":"Уборка офиса","price":5000,"duration":180},{"name":"Генеральная уборка","price":10000,"duration":480}]',
 '{"hero_title":"{name} — онлайн-запись","hero_subtitle":"Запишитесь онлайн за 30 секунд. Без звонков.","cta":"Записаться"}',
 '{"primary":"#111111","secondary":"#f5f5f5","bg":"#ffffff"}',
 '{"show_map":true,"show_gallery":true,"show_reviews":false}', true, true),

('Стоматология', 'dentistry', '🦷', 'st', 'Лечение и профилактика', '["врач"]',
 '[{"name":"Консультация","price":500,"duration":30},{"name":"Чистка","price":5000,"duration":60},{"name":"Лечение","price":8000,"duration":60}]',
 '{"hero_title":"{name} — онлайн-запись","hero_subtitle":"Запишитесь онлайн за 30 секунд. Без звонков.","cta":"Записаться"}',
 '{"primary":"#111111","secondary":"#f5f5f5","bg":"#ffffff"}',
 '{"show_map":true,"show_gallery":false,"show_reviews":false}', true, true),

('Ветклиника', 'vet', '🐾', 'v', 'Осмотр и вакцинация питомцев', '["питомец"]',
 '[{"name":"Осмотр","price":1000,"duration":30},{"name":"Вакцинация","price":2000,"duration":20},{"name":"Стрижка","price":3000,"duration":60}]',
 '{"hero_title":"{name} — онлайн-запись","hero_subtitle":"Запишитесь онлайн за 30 секунд. Без звонков.","cta":"Записаться"}',
 '{"primary":"#111111","secondary":"#f5f5f5","bg":"#ffffff"}',
 '{"show_map":true,"show_gallery":false,"show_reviews":false}', true, true)
on conflict (slug) do nothing;
