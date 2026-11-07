# detailing/ — шаблон детейлинга

Ниша «Детейлинг» (url-префикс `d`). Рендерит готовый сайт-визитку с онлайн-записью.

Общий код шаблонов вынесен в `шаблоны/_shared/` (движок `NicheSite` + `NicheBookingFlow` +
адаптер `niche-tenant`), поэтому здесь только пресет ниши:

- `theme.ts` — пресет `NicheTheme` (копирайт, иконки, инфо-карточки, поле «Автомобиль», ресурсы);
- `template.json` — манифест (читает `связь/registry.ts`);
- `README.md` — этот файл.

Отрисовку и логику записи берёт `шаблоны/_shared/NicheSite.tsx` по `theme.glyph`,
`theme.infoCards`, `theme.detailField`, `theme.businessNoun`.

Статика (общая для всех ниш) лежит в `public/`: `public/assets/detailing-scoped.css`,
`detailing-fonts.css`, `public/media/glowdetailing/`.
