import type { NicheTheme } from '@/шаблоны/_shared/niche-tenant';

const theme: NicheTheme = {
  key: 'detailing',
  prefix: 'd',
  // Палитра 1:1 с референсом D:\Clode\Детейленг (src/index.css):
  // --color-bg 0 0 0, surface 10 10 10, border 36 36 36, accent 70 144 255.
  // NicheSite перекрывает CSS-переменные эталонного detailing-scoped.css через
  // inline style на .detailing-root — поэтому значения обязаны совпадать с origin.
  accent: '#4690ff',
  accent2: '#4690ff',
  mode: 'dark',
  bg: '#000000',
  surface: '#0a0a0a',
  border: '#242424',
  borderHover: '#36363c',
  text: '#ffffff',
  textMuted: '#91919e',
  textSubtle: '#7d7d87',
  glyph: 'car',
  businessNoun: 'студия',
  tagline: 'Премиум-детейлинг вашего авто',
  intro: 'Полный спектр услуг по уходу за автомобилем: от бесконтактной мойки до керамического покрытия кузова. Работаем с гарантией и только проверенной премиум-химией.',
  asideTitle: 'Свежий вид для вашего авто',
  asideText: 'Выберите услугу и удобное время — остальное возьмём на себя.',
  ctaPrimary: 'Записаться',
  ctaBook: 'Выбрать время',
  installTitle: 'Студия всегда под рукой.',
  installText: 'Записывайтесь за несколько касаний, без поиска ссылки и звонков.',
  installCta: 'Добавить на экран',
  resourceLabel: 'бокс',
  resourceType: 'bay',
  resourceCount: 2,
  infoCards: [
    { id: 'hours', title: 'Без выходных', description: 'Открыты с 9 до 21 в будни, до 18 в воскресенье.', icon: 'clock' },
    { id: 'warranty', title: 'Гарантия 14 дней', description: 'Переделываем любую работу бесплатно.', icon: 'shield' },
    { id: 'chemi', title: 'Своя премиум-химия', description: 'Только проверенные составы без ущерба ЛКП.', icon: 'sparkle' },
  ],
  defaultServices: [
    { name: 'Комплексная мойка', price: 1500, duration: 60 },
    { name: 'Химчистка салона', price: 6500, duration: 240 },
    { name: 'Полировка кузова', price: 12000, duration: 180 },
    { name: 'Керамическое покрытие', price: 28000, duration: 480 },
  ],
  // Заголовки секций — дословно из эталонного D:\Clode\Детейленг (Home.tsx):
  // «Услуги», «Работы студии», «Запись в студию».
  sectionTitles: { services: 'Услуги', gallery: 'Работы студии', booking: 'Запись в студию' },
  detailField: {
    title: 'Ваш автомобиль',
    label: 'Автомобиль',
    placeholder: 'Марка и модель',
    pattern: '^[А-Яа-яЁёA-Za-z0-9 .\\-]{2,60}$',
    patternMessage: 'Автомобиль: от 2 до 60 символов, без спецсимволов',
  },
};

export default theme;
