// связь/registry.ts — реестр шаблонов: читает шаблоны/*/template.json.
// Не импортирует код шаблонов; работает по файлам-манифестам.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type TemplateManifest = {
  name: string;
  slug: string;
  urlPrefix: string;
  description?: string;
  entry?: string;
  env?: string[];
};

const TEMPLATES_DIR = join(process.cwd(), 'шаблоны');

/** Список манифестов всех шаблонов. Битые/отсутствующие пропускаются. */
export function listTemplateManifests(): TemplateManifest[] {
  try {
    return readdirSync(TEMPLATES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        try {
          const raw = readFileSync(join(TEMPLATES_DIR, entry.name, 'template.json'), 'utf8');
          const parsed = JSON.parse(raw) as Partial<TemplateManifest>;
          if (!parsed.name || !parsed.slug || !parsed.urlPrefix) return null;
          return parsed as TemplateManifest;
        } catch {
          return null;
        }
      })
      .filter((manifest): manifest is TemplateManifest => manifest !== null);
  } catch {
    return [];
  }
}

/** Слаг шаблона по url-префиксу (например, 'd' → 'detailing'). */
export function findTemplateByPrefix(prefix: string): TemplateManifest | null {
  return listTemplateManifests().find((manifest) => manifest.urlPrefix === prefix) ?? null;
}
