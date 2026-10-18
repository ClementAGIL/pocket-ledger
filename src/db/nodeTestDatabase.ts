import type { SQLiteDatabase } from 'expo-sqlite';
// Test-only helper: never imported by the app (Metro only bundles what the app imports).

/**
 * Minimal stand-in for expo-sqlite's async API on top of Node's built-in SQLite, so the real
 * migrations, repository and demo code can run in jest. Only the methods the app uses are provided.
 */
export function openTestDatabase(): SQLiteDatabase {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const args = (params: unknown[]) => (params.length === 1 && Array.isArray(params[0]) ? params[0] : params);

  const api = {
    execAsync: async (sql: string) => db.exec(sql),
    runAsync: async (sql: string, ...params: unknown[]) => {
      const r = db.prepare(sql).run(...args(params));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    getFirstAsync: async (sql: string, ...params: unknown[]) => db.prepare(sql).get(...args(params)) ?? null,
    getAllAsync: async (sql: string, ...params: unknown[]) => db.prepare(sql).all(...args(params)),
    withTransactionAsync: async (task: () => Promise<void>) => {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    withExclusiveTransactionAsync: async (task: (txn: unknown) => Promise<void>) =>
      api.withTransactionAsync(() => task(api)),
  };
  return api as unknown as SQLiteDatabase;
}
