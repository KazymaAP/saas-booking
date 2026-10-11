// lib/site.ts — адрес сервиса в одном месте. Смена домена = смена NEXT_PUBLIC_SITE_URL и MAIN_HOSTS.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zapishisya.ru').replace(/\/$/, '');

// Хосты основного сайта. Всё остальное считается кастомным доменом клиента (middleware).
export const MAIN_HOSTS = ['zapishisya.ru', 'www.zapishisya.ru', 'localhost:3000'] as const;
