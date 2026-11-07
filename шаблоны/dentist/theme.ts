import type { NicheTheme } from '@/шаблоны/_shared/niche-tenant';

const theme: NicheTheme = {
  key: 'dentist',
  prefix: 's',
  accent: '#06b6d4',
  accent2: '#3b82f6',
  mode: 'light',
  bg: '#f5fbfd',
  surface: '#ffffff',
  border: '#d8ebf2',
  borderHover: '#c3e0ea',
  text: '#16323d',
  textMuted: '#567480',
  textSubtle: '#5c717a',
  glyph: 'tooth',
  businessNoun: 'клиника',
  tagline: 'Стоматология с заботой о вас',
  intro: 'Терапия, гигиена, отбеливание, имплантация и ортодонтия. Современное оборудование и прозрачные цены.',
  asideTitle: 'Здоровая улыбка — в пару кликов',
  asideText: 'Выберите услугу и удобное время — врач подтвердит запись.',
  ctaPrimary: 'Записаться на приём',
  ctaBook: 'Выбрать время',
  installTitle: 'Клиника всегда под рукой.',
  installText: 'Записывайтесь на приём за несколько касаний, без очередей.',
  installCta: 'Добавить на экран',
  resourceLabel: 'кабинет',
  resourceType: 'cabinet',
  resourceCount: 3,
  infoCards: [
    { id: 'equip', title: 'Современное оборудование', description: 'Точная диагностика и комфортное лечение.', icon: 'stethoscope' },
    { id: 'painless', title: 'Безболезненно', description: 'Качественная анестезия и деликатный подход.', icon: 'heart' },
    { id: 'warranty', title: 'Гарантия на работы', description: 'Фиксируем результат и отвечаем за него.', icon: 'shield' },
  ],
  defaultServices: [
    { name: 'Консультация', price: 1000, duration: 30 },
    { name: 'Профессиональная гигиена', price: 5000, duration: 60 },
    { name: 'Лечение кариеса', price: 8500, duration: 60 },
    { name: 'Отбеливание', price: 22000, duration: 90 },
  ],
  detailField: {
    title: 'Комментарий для врача',
    label: 'Комментарий',
    placeholder: 'Жалобы или пожелания (необязательно)',
    optional: true,
  },
};

export default theme;
