# главная/ — супер-админка

Здесь UI-компоненты и вспомогательная логика супер-админки:

- `components/` — ActionForm, BulkTable, ConfirmDialog, Pager, PanelNav, PrefetchLink, Skeleton, StatusBadge, Toast;
- `lib/` — action, audit-labels, business-filters, db, fake-db, guard, network, statuses, url (+ тесты).

Маршруты (`page.tsx`, `layout.tsx`, `actions.ts`) остаются в `app/panel/**` — Next требует их в `app/`; они импортируют код отсюда.

Правило: `главная` — только админка. Публичные сайты шаблонов и бот сюда не входят.

