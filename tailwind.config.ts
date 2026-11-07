// tailwind.config.ts — Tailwind без shadcn (ТЗ §2).
// Цвета в коде задаются произвольными значениями (text-[#666666]) и CSS-переменными из globals.css,
// поэтому theme.extend пуст: неиспользуемые токены удалены (проверено grep по app/ и components/).
import type { Config } from 'tailwindcss';

const config: Config = {
  // Все места, где встречаются классы Tailwind. components/ раньше не сканировался — классы Hero/MapLazy/MapBlock вырезались.
  content: ['./app/**/*.{ts,tsx}', './общие/**/*.{ts,tsx}', './шаблоны/**/*.{ts,tsx}', './главная/**/*.{ts,tsx}'],
  // preflight отключён и в globals.css (нет @tailwind base); здесь — чтобы не включился случайно.
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};

export default config;
