// общие/lib/demo-secret.ts — пароль демо-аккаунтов. ⚠️ Только сервер: в бандл клиента не попадает.
//
// Почему не константа в demo-constants.ts: тот модуль импортируют клиентские компоненты
// ('use client'), и зашитый пароль оказался бы в общем чанке — то есть в браузере у любого
// посетителя. Пароль от настоящей сессии владельца/партнёра — это готовый вход в демо-кабинет.
//
// Правила:
//   ▸ DEMO_PASSWORD задан — используем его;
//   ▸ не задан и NODE_ENV=production — падаем (fail closed), а не подставляем известный пароль;
//   ▸ не задан в dev/test — локальное значение по умолчанию, чтобы демо работало из коробки.
const DEV_FALLBACK_PASSWORD = 'demo12345';

export function demoPassword(): string {
  const fromEnv = (process.env.DEMO_PASSWORD ?? '').trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Не задан DEMO_PASSWORD — демо-вход в продакшене невозможен');
  }
  return DEV_FALLBACK_PASSWORD;
}
