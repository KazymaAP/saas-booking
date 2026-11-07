import type { NicheTheme } from '@/шаблоны/_shared/niche-tenant';

const theme: NicheTheme = {
  key: 'fitness',
  prefix: 'f',
  accent: '#22c55e',
  accent2: '#84cc16',
  mode: 'dark',
  bg: '#07140d',
  surface: '#0d2116',
  border: '#1b3a28',
  borderHover: '#29543a',
  text: '#eafff2',
  textMuted: '#93b8a3',
  textSubtle: '#6f957f',
  glyph: 'dumbbell',
  businessNoun: 'клуб',
  tagline: 'Фитнес-клуб для всех уровней',
  intro: 'Тренажёрный зал, групповые направления и персональные тренировки. Занимайтесь в своём темпе с поддержкой тренеров.',
  asideTitle: 'Движение — это жизнь',
  asideText: 'Выберите тренировку и удобное время — место в зале забронировано.',
  ctaPrimary: 'Записаться на тренировку',
  ctaBook: 'Выбрать время',
  installTitle: 'Клуб всегда под рукой.',
  installText: 'Записывайтесь на тренировки за несколько касаний.',
  installCta: 'Добавить на экран',
  resourceLabel: 'зал',
  resourceType: 'room',
  resourceCount: 3,
  infoCards: [
    { id: 'gear', title: 'Современные тренажёры', description: 'Полный зал кардио и силовых зон.', icon: 'dumbbell' },
    { id: 'group', title: 'Групповые занятия', description: 'Йога, функциональный, кроссфит и больше.', icon: 'users' },
    { id: 'pt', title: 'Персональные тренировки', description: 'Программа под вашу цель и уровень.', icon: 'medal' },
  ],
  defaultServices: [
    { name: 'Персональная тренировка', price: 3000, duration: 60 },
    { name: 'Групповое занятие', price: 900, duration: 60 },
    { name: 'Функциональный тренинг', price: 1500, duration: 60 },
    { name: 'Растяжка', price: 1200, duration: 45 },
  ],
  detailField: {
    title: 'Ваши пожелания',
    label: 'Пожелания',
    placeholder: 'Направление или тренер (необязательно)',
    optional: true,
  },
};

export default theme;
