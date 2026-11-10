// _lib/client-action.ts — вызов server action из клиентского компонента с повтором при сетевой ошибке.
// Бизнес-ошибки (ok: false) не повторяем: повтор не изменит результат и может, например, отправить второе письмо.
import { ERR, type ActionResult } from './result';

const RETRY_DELAY_MS = 600;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callAction<T>(run: () => Promise<ActionResult<T>>, retries = 1): Promise<ActionResult<T>> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      // redirect()/notFound() внутри action бросают служебные ошибки Next — их нужно пробросить дальше.
      if (error instanceof Error && 'digest' in error && typeof error.digest === 'string') throw error;
      if (attempt >= retries) return { ok: false, error: ERR.network };
      await wait(RETRY_DELAY_MS * (attempt + 1));
    }
  }
}
