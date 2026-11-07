import type { NicheTheme } from '@/шаблоны/_shared/niche-tenant';

const theme: NicheTheme = {
  key: 'lawyer',
  prefix: 'l',
  accent: '#4f46e5',
  accent2: '#d4af37',
  mode: 'light',
  bg: '#f5f7fb',
  surface: '#ffffff',
  border: '#dbe2ef',
  borderHover: '#c6d1e6',
  text: '#1b2540',
  textMuted: '#5f6b85',
  textSubtle: '#687082',
  glyph: 'scales',
  businessNoun: 'бюро',
  tagline: 'Юридическая помощь и защита',
  intro: 'Консультации, договоры, представительство в суде и сопровождение сделок. Конфиденциально и с фиксированной ценой.',
  asideTitle: 'Защитим ваши интересы',
  asideText: 'Выберите услугу и удобное время — юрист подтвердит консультацию.',
  ctaPrimary: 'Записаться на консультацию',
  ctaBook: 'Выбрать время',
  installTitle: 'Бюро всегда под рукой.',
  installText: 'Записывайтесь на консультации за несколько касаний.',
  installCta: 'Добавить на экран',
  resourceLabel: 'кабинет',
  resourceType: 'cabinet',
  resourceCount: 2,
  infoCards: [
    { id: 'conf', title: 'Конфиденциально', description: 'Полная тайна обращения и документов.', icon: 'shield' },
    { id: 'exp', title: 'Опыт и практика', description: 'Реальные дела и положительные решения.', icon: 'medal' },
    { id: 'price', title: 'Фиксированная цена', description: 'Понимаете стоимость до начала работы.', icon: 'scales' },
  ],
  defaultServices: [
    { name: 'Консультация', price: 3000, duration: 30 },
    { name: 'Составление договора', price: 8000, duration: 60 },
    { name: 'Представительство в суде', price: 25000, duration: 120 },
    { name: 'Сопровождение сделки', price: 40000, duration: 180 },
  ],
  detailField: {
    title: 'Суть вопроса',
    label: 'Суть вопроса',
    placeholder: 'Кратко опишите ситуацию (необязательно)',
    optional: true,
  },
};

export default theme;
