# телеграмм-бот/ — только бот

Логика бота:

- `telegram.ts`, `telegram-webhook.ts`, `telegram-admin.ts`, `telegram-connect.ts`, `telegram-events.ts`, `telegram-format.ts`;
- тесты `telegram*.test.ts` и `telegram.fake-db.ts`.

Webhook-маршрут остаётся в `app/api/telegram/webhook/route.ts` (Next требует route в `app/`) и вызывает код отсюда.

