-- служебное/seed-detailing-reference.sql — наполнение эталонного детейлинга (vippro).
--
-- Зачем: эталонный шаблон нужно на что-то смотреть. Скрипт кладёт отзывы, команду,
-- вопросы и плашки на услуги одного бизнеса — vippro (ниша «Детейлинг», префикс /d).
--
-- Идемпотентность: каждая вставка выполняется только если у бизнеса ещё нет строк
-- в этой таблице. Повторный запуск ничего не дублирует и не затирает правки владельца.
--
-- Запуск: тот же Management API, что и миграции (см. журнал 2026-11-18).

begin;

-- Плашки и старая цена на услугах: показывают, что скидка настоящая, а не нарисованная.
update public.services s
   set badge = 'Хит', old_price = 1300
  from public.businesses b
 where b.id = s.business_id and b.slug = 'vippro' and s.name = 'Шиномонтаж';

update public.services s
   set badge = '−20%', old_price = 1250
  from public.businesses b
 where b.id = s.business_id and b.slug = 'vippro' and s.name = 'Химчистка салона';

update public.services s
   set badge = 'Популярное'
  from public.businesses b
 where b.id = s.business_id and b.slug = 'vippro' and s.name = 'Полировка кузова';

update public.services s
   set badge = 'Хит', old_price = 4200
  from public.businesses b
 where b.id = s.business_id and b.slug = 'vippro' and s.name = 'Керамика';

update public.services s
   set badge = 'Новинка'
  from public.businesses b
 where b.id = s.business_id and b.slug = 'vippro' and s.name = 'Антигравийная плёнка от сколов';

-- Отзывы.
insert into public.reviews (business_id, author_name, rating, body, service_name, source, sort_order)
select b.id, v.author_name, v.rating, v.body, v.service_name, v.source, v.sort_order
  from public.businesses b
  cross join (values
    ('Артём К.', 5, 'Делал керамику на Camry — забрал вечером, машина как из салона. Показали фото до и после, объяснили, как ухаживать первые две недели.', 'Керамика', 'Яндекс', 0),
    ('Марина С.', 5, 'Химчистка салона после собаки: вывели всё, запаха нет вообще. Приехала без записи, приняли за десять минут.', 'Химчистка салона', '2ГИС', 1),
    ('Дмитрий Л.', 4, 'Полировка убрала паутинку полностью. Ждал на полчаса дольше заявленного, но результатом доволен.', 'Полировка кузова', 'Яндекс', 2),
    ('Сергей В.', 5, 'Мойка на высоте, диски не жалеют времени. Езжу только сюда уже второй год.', 'Комплексная мойка', 'Сайт', 3),
    ('Ольга П.', 5, 'Восстановительная полировка после веток: сколы не обещали убрать, но стало заметно лучше. Честно предупредили заранее.', 'Полировка кузова', 'Яндекс', 4),
    ('Илья М.', 5, 'Записался через сайт за две минуты, накануне напомнили о визите. Мелочь, а приятно.', 'Комплексная мойка', 'Сайт', 5)
  ) as v(author_name, rating, body, service_name, source, sort_order)
 where b.slug = 'vippro'
   and not exists (select 1 from public.reviews r where r.business_id = b.id);

-- Команда.
insert into public.staff (business_id, name, position, experience_years, description, sort_order)
select b.id, v.name, v.position, v.experience_years, v.description, v.sort_order
  from public.businesses b
  cross join (values
    ('Артём Гончаров', 'Мастер-детейлер', 8, 'Керамика и полировка. Сертификат по составу Gyeon.', 0),
    ('Никита Ершов', 'Детейлер', 4, 'Химчистка салона, кожа и алькантара.', 1),
    ('Ольга Ким', 'Администратор', 3, 'Запись, приём автомобилей, контроль сроков.', 2)
  ) as v(name, position, experience_years, description, sort_order)
 where b.slug = 'vippro'
   and not exists (select 1 from public.staff s where s.business_id = b.id);

-- Вопросы и ответы.
insert into public.faq_items (business_id, question, answer, sort_order)
select b.id, v.question, v.answer, v.sort_order
  from public.businesses b
  cross join (values
    ('Сколько по времени занимает керамика?', 'От восьми часов. Обычно оставляем автомобиль на сутки: слою нужно время полимеризоваться, иначе он не держится.', 0),
    ('Можно приехать без записи?', 'На мойку — да, если свободен бокс. На полировку, керамику и химчистку — только по записи, иначе мастер не закреплён за вами.', 1),
    ('Даёте гарантию на работы?', 'Четырнадцать дней на любую работу. Если что-то не так — переделаем бесплатно.', 2),
    ('Работаете с юридическими лицами?', 'Да. Есть договор и закрывающие документы, для автопарков — отдельные условия и график.', 3),
    ('Чем моете кузов?', 'Профессиональной химией с нейтральным pH. Она не смывает воск и не вредит лаку.', 4)
  ) as v(question, answer, sort_order)
 where b.slug = 'vippro'
   and not exists (select 1 from public.faq_items f where f.business_id = b.id);

commit;
