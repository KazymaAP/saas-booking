// общие/lib/copy-mode-paths.ts — константы временного раздела /test/ful/sts.
// Вынесены отдельно от copy-mode.ts: тот использует next/headers и не годится для Edge-middleware.
export const COPY_PREFIX = '/test/ful/sts';
export const COPY_MODE_HEADER = 'x-copy-mode';
export const COPY_PATH_HEADER = 'x-copy-path';
