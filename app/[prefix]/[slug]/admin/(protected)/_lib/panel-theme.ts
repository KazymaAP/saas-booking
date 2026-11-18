// _lib/panel-theme.ts — CSS-переменные оформления кабинета: одни и те же у панели и у страницы смены.
// Оформление: по умолчанию стиль ниши бизнеса (как его сайт), в настройках можно выбрать любой из 10 стилей.
// Акцент остаётся фирменным цветом бизнеса, если он задан (design-spec §5), иначе берётся акцент стиля.
// accentColor() гарантирует контраст 4.5:1 с белым текстом кнопок.
import { accentColor } from './color';
import { appearanceVars, type Appearance } from '@/lib/appearance';

export type ThemeStyle = React.CSSProperties & Record<`--${string}`, string>;

export function panelThemeStyle(theme: Appearance, brandColor: string | null): ThemeStyle {
  const vars = appearanceVars(theme);
  return { ...vars, '--brand-color': accentColor(brandColor) || vars['--brand-color'] };
}
