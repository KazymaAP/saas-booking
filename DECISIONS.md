# DECISIONS.md — решения по умолчанию (ТЗ §0.2: принимать разумный дефолт и фиксировать)

Дата: 2026-10-11. Владелец проекта подтвердил оплату Vercel Pro и Supabase Pro.

## Архитектура
- Прототипы: `/preview/{slug}?token=<preview_token>`. Префикс `t` (шиномонтаж) не занимает `/t/`.
- Rate limit: таблица `rate_limits` в Postgres, а не `Map` в памяти (serverless-инстансы не делят память).
- Статусы бронирования: добавлены `confirmed`, `cancelled`, `done`, `no_show`. ТЗ использует `new` и `confirmed` в индексе, остальные нужны для отмены и статистики.
- Cron: Vercel Pro, до раза в минуту. Запасной вариант — внешний планировщик с `Bearer CRON_SECRET`.
- Хостинг: Vercel Pro, Supabase Pro. Регион Supabase: выбирается при создании, по умолчанию ближайший.

## Открытый риск (не решён, принят владельцем)
- ФЗ-152, ст. 18 ч. 5: ПД граждан РФ должны храниться в РФ. Сейчас данные уходят на зарубежные серверы. Решение владельца: «осознанный риск». Перенос на российский хостинг заложен как абстракция `DB_PROVIDER` в `.env.example`.
- Холодная email-рассылка (ФЗ «О рекламе», ст. 18): требует юридической проверки до запуска рассылки.

## Версии
- Node 20 LTS, pnpm (по ТЗ §0.1). package.json зафиксирован на версии, совместимые с Next 14.2.
- Next.js 14.2.15, React 18.3.1 (ТЗ указывает Next 14, React 19 с ним не совместим на стабильных ветках).

## Стек без отклонений
Tailwind без shadcn; Supabase JS без ORM; react-hook-form + zod; Leaflet через dynamic import с `ssr: false`; нативный color picker; SVG-иконки inline; PWA через manifest + простой service worker; собственная аналитика.

## Статус сборки
- Готово: `supabase/migrations/0001_init.sql`, `.env.example`, `package.json`, `tsconfig.json`, `lib/database.types.ts`, `lib/slug.ts`, `lib/phone.ts`.
- Не проверено: миграция не запускалась на Postgres, `pnpm install` и `tsc` не запускались. Проверить первым делом.
- Следующие шаги: `lib/` (ядро), публичный сайт и middleware, форма брони и API, email и cron, супер-админка, админка бизнеса, импорт Excel, генератор прототипов, лицензии и Telegram.
