// app/panel/(protected)/_lib/guard.ts — проверка прав супер-админа для server actions и route handlers.
// Layout защищает только рендер страниц. Server action — это публичный POST-эндпоинт, поэтому каждое
// действие обязано вызвать requireSuperAdmin() первой строкой (промт агента 7, «Безопасность»).
// Модуль импортирует next/headers (через admin-session), поэтому в клиентский бандл попасть не может.
// CSRF: Next 14 сверяет Origin с Host для server actions; cookie сессии — sameSite=lax (lib/admin-session.ts).
import { isSuperAdmin } from '@/lib/admin-session';

export class ForbiddenError extends Error {
  constructor() {
    super('forbidden');
    this.name = 'ForbiddenError';
  }
}

export async function requireSuperAdmin(): Promise<void> {
  if (!(await isSuperAdmin())) throw new ForbiddenError();
}
