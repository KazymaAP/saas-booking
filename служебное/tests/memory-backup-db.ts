// tests/memory-backup-db.ts — BackupDb в памяти для unit-тестов lib/backup*.test.ts (не Playwright-спека).
// fail_upsert/fail_select/throw_upsert/fail_upload — имитация ошибок конкретных таблиц и Storage.
import { BACKUP_TABLES, type BackupDb, type BackupFile, type BackupTable, type Row } from '../../общие/lib/backup';

export class MemoryDb implements BackupDb {
  tables = new Map<BackupTable, Map<string, Row>>();
  files = new Map<string, string>();
  upsert_calls: { table: BackupTable; size: number }[] = [];
  signed: { name: string; ttl: number }[] = [];
  fail_upsert = new Set<BackupTable>();
  fail_select = new Set<BackupTable>();
  fail_upload = false;
  throw_upsert = new Set<BackupTable>();

  constructor(seed: Partial<Record<BackupTable, number>> = {}) {
    for (const t of BACKUP_TABLES) {
      const m = new Map<string, Row>();
      for (let i = 0; i < (seed[t] ?? 0); i += 1) {
        const id = `${t}-${String(i).padStart(6, '0')}`;
        m.set(id, { id, n: i });
      }
      this.tables.set(t, m);
    }
  }

  rows(t: BackupTable): Row[] {
    return [...(this.tables.get(t) ?? new Map<string, Row>()).values()];
  }

  async selectPage(table: BackupTable, from: number, to: number) {
    if (this.fail_select.has(table)) return { rows: [], error: 'select failed' };
    const sorted = this.rows(table).sort((a, b) => a.id.localeCompare(b.id));
    return { rows: sorted.slice(from, to + 1), error: null };
  }

  async upsert(table: BackupTable, rows: Row[]) {
    this.upsert_calls.push({ table, size: rows.length });
    if (this.throw_upsert.has(table)) throw new TypeError('fetch failed');
    if (this.fail_upsert.has(table)) return { error: 'violates foreign key constraint' };
    const m = this.tables.get(table) ?? new Map<string, Row>();
    for (const r of rows) m.set(r.id, { ...r });
    this.tables.set(table, m);
    return { error: null };
  }

  async upload(name: string, body: string) {
    if (this.fail_upload) return { error: 'storage down' };
    this.files.set(name, body);
    return { error: null };
  }

  async download(name: string) {
    const text = this.files.get(name);
    return text === undefined ? { text: null, error: 'Object not found' } : { text, error: null };
  }

  async list() {
    const files: BackupFile[] = [...this.files.keys()].map((name) => ({ name, size: this.files.get(name)?.length ?? null, created_at: null }));
    return { files, error: null };
  }

  async remove(names: string[]) {
    for (const n of names) this.files.delete(n);
    return { error: null };
  }

  async signedUrl(name: string, ttl_s: number) {
    this.signed.push({ name, ttl: ttl_s });
    return `https://storage.example/${name}?token=t&ttl=${ttl_s}`;
  }
}
