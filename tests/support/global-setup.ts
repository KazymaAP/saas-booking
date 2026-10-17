// tests/support/global-setup.ts — проверка окружения до старта E2E: тестовая БД доступна и в ней есть миграции.
import { testDb } from './env';

export default async function globalSetup(): Promise<void> {
  const { error } = await testDb().from('vertical_templates').select('id').limit(1);
  if (error) throw new Error(`E2E: тестовый Supabase недоступен или без миграций: ${error.message}`);
}
