# Reference Content — Russian Car-Detailing Studio (Детейлинг)

> Импортировано из `D:\Clode\Детейленг\src\tenants\reference-content.md` (исходный проект не изменялся).
> Справочный материал по нише детейлинга: таксономия услуг, FAQ, UX-паттерны записи.

> Sourced reference material for the demo tenant. Compiled 2026-10-18.
> Source domains used: `lightun.ru` (Moscow detailing center, real service list + indicative prices),
> `spb.okleyka.pro` (St. Petersburg detailing center, service taxonomy, hours, location),
> `remark-studio.ru` (Voronezh detailing center, service context).
> Prices are *indicative* ("от" / from) for the RU market and may vary by car/model.
> FAQ is synthesized from common RU detailing-studio practices observed across these sources
> (working hours, location format, pricing disclaimers, guarantees, car-pickup service).

## Services

| # | Название (RU) | Название (EN) | Описание | Цена (от) |
|---|---------------|---------------|----------|-----------|
| 1 | Комплексная мойка кузова | Detailing wash | Ручная комплексная мойка: кузов, диски, арки, подкапотное пространство, антидождь. | 1 000 ₽ |
| 2 | Химчистка салона | Interior dry cleaning | Глубокая сухая химчистка ткани/кожи, удаление пятен и запахов, озонирование, уход за пластиком. | 7 000 ₽ |
| 3 | Полировка кузова | Paint polishing | Восстановительная / глубокая полировка, устранение голограмм и микроцарапин. | 4 500 ₽ |
| 4 | Керамическое покрытие | Ceramic coating | Защитный нанослой (Ceramic Pro 9H / ServFaces / Zvizzer): блеск + гидрофобность. | 8 900 ₽ |
| 5 | Антигравийная плёнка (PPF) | PPF protection | Полиуретановая защита капота / фар / кузова от сколов и реагентов. | 12 000 ₽ |
| 6 | Тонировка стёкол | Window tinting | Атермальная / по ГОСТ тонировка (боковые, ветровое, заднее). | 1 000 ₽ |

## FAQ

**Q: В какое время вы работаете?**
A: Ежедневно с 10:00 до 20:00. Запись — по телефону/WhatsApp. (Некоторые студии держат автомойку круглосуточно — уточняйте у менеджера.)

**Q: Где вы находитесь и как вас найти?**
A: Адрес и ориентиры даёт менеджер при записи (примеры из практики: ул. Кантемировская, 65с12, Москва; Автополе Кудрово, пр. Строителей 25с2, Санкт-Петербург). Возможен забор и доставка авто эвакуатором.

**Q: Можно ли отменить или перенести запись?**
A: Да. Перенос и отмена бесплатны при уведомлении минимум за 24 часа. При опоздании/неявке без предупреждения залог за бронь не возвращается.

**Q: Как подготовить автомобиль к приёму?**
A: Заберите личные вещи, освободите багажник и салон, оставьте ~1/4 бака топлива. Перед химчисткой/полировкой машину мыть не нужно — мастер оценит реальное состояние.

**Q: Какими способами можно оплатить?**
A: Наличные, банковская карта, СБП, банковский перевод. Для бронирования даты берём небольшую предоплату. На работы — гарантия до 5 лет (по договору).

**Q: Сколько занимает услуга?**
A: Химчистка салона — ~4–6 ч, керамика / PPF — 1–2 дня в зависимости от объёма. Точный срок назвёт менеджер после осмотра авто.

## Gallery Images

Verified HTTP 200 via HEAD request (2026-10-18). Full-resolution direct links — visual subject labelled from best estimate, **double-check subject before publishing**.

```
https://images.unsplash.com/photo-1601362840469-51e4d8d58785?w=1600&q=80&auto=format&fit=crop
https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=1600&q=80&auto=format&fit=crop
https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=1600&q=80&auto=format&fit=crop
https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=1600&q=80&auto=format&fit=crop
https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=1600&q=80&auto=format&fit=crop
https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1600&q=80&auto=format&fit=crop
```

Suggested mapping: lines 1–3 exterior wash/polish, line 4 interior cleaning, lines 5–6 finished/protective-coating showcase.

## Booking UX Patterns

- **Step wizard, not a wall of forms:** Услуга → Дата/время (живой календарь со свободными слотами) → Авто (марка/модель/год) → Контакт. Показывайте доступность в реальном времени.
- **Transparent "от" pricing with a disclaimer:** Цены "от" + честная пометка, что финал зависит от авто/объёма/материалов (реальная практика студий). Избегайте скрытых доплат.
- **Frictionless confirmation & reminders:** Подтверждение записи в SMS/WhatsApp, напоминание за 24 ч, и отмена/перенос в один клик (снижает no-show).
- **Trust via "до/после" gallery + reviews:** Реальные фото результатов и звёздные отзывы заметно повышают конверсию брони.
- **Low-friction CTA & pre-fill:** Кнопка "Записаться в WhatsApp/Telegram" рядом с формой, автозаполнение данных авто из истории клиента.
