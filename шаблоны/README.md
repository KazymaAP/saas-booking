# шаблоны/ — шаблоны ниш

Одна папка = один шаблон ниши. У каждого есть `template.json` (манифест, читает `связь/registry.ts`)
и `theme.ts` (пресет `NicheTheme`). Общий код шаблонов вынесен в `шаблоны/_shared/`
(движок `NicheSite` + `NicheBookingFlow` + адаптер `niche-tenant`), поэтому каждая ниша —
это только пресет, без дублирования разметки.

Сейчас 10 ниш:

| Префикс | Ниша            | Папка         |
|---------|-----------------|--------------|
| d       | Детейлинг       | detailing    |
| b       | Салон красоты    | beauty       |
| s       | Стоматология     | dentist      |
| f       | Фитнес-клуб     | fitness      |
| t       | Репетитор/курсы  | tutor        |
| p       | Фотостудия      | photographer |
| l       | Юрист/адвокат    | lawyer       |
| v       | Ветклиника       | vet          |
| c       | Клининг         | cleaning     |
| r       | Ремонт техники   | repair       |

Маршрутизация: `app/[prefix]/[slug]/page.tsx` берёт тему по префиксу через
`шаблоны/_shared/themes.ts` (`getNicheTheme(prefix)`). Если темы нет — рендерит
универсальный `StudioTemplate`. CSS общего дизайна — `public/assets/detailing-scoped.css`
(scoped под `.detailing-root`, используется всеми нишами).

Добавить нишу = создать папку с `theme.ts` + `template.json` + `README.md` и зарегистрировать
пресет в `шаблоны/_shared/themes.ts`.
