import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { loadSnapshot } from '@/db/repo';
import type { Snapshot } from '@/domain/types';

import {
  backupFileName,
  backupsToPrune,
  needsDailyBackup,
  sortBackups,
  type BackupFileInfo,
  type BackupReason,
} from './autoBackupRules';
import { parseBackup, serializeBackup } from './format';

/*
 * Automatic backups live in the app's private storage (not in the cloud: Android backup is
 * disabled). They protect against input mistakes, not against losing the phone: they disappear
 * with the app. Failures never block the app: an automatic backup is best effort.
 */

const folder = () => new Directory(Paths.document, 'backups');

function listNames(): string[] {
  const dir = folder();
  if (!dir.exists) return [];
  return dir.list().filter((e): e is File => e instanceof File).map((f) => f.name);
}

export interface LocalBackup extends BackupFileInfo {
  size: number | null;
}

export function listLocalBackups(): LocalBackup[] {
  const dir = folder();
  return sortBackups(listNames()).map((b) => ({ ...b, size: new File(dir, b.name).size }));
}

/** Writes a backup of the current data, then keeps only the `keep` most recent ones. */
export async function createLocalBackup(db: SQLiteDatabase, reason: BackupReason, keep: number) {
  const dir = folder();
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, backupFileName(reason, new Date()));
  if (!file.exists) file.create();
  file.write(serializeBackup(await loadSnapshot(db)));
  for (const name of backupsToPrune(listNames(), keep)) new File(dir, name).delete();
}

async function hasData(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM assets');
  return !!row?.n;
}

/** The daily safety net: called before every change, writes at most one backup per day. */
export async function ensureDailyBackup(db: SQLiteDatabase, keep: number) {
  if (!needsDailyBackup(listNames(), new Date())) return;
  // Nothing to protect yet on a fresh install.
  if (!(await hasData(db))) return;
  await createLocalBackup(db, 'daily', keep);
}

/** Backup before a risky action (restore, reset, delete all). Best effort: never throws. */
export async function safetyBackup(
  db: SQLiteDatabase,
  reason: Exclude<BackupReason, 'daily'>,
  options: { enabled: boolean; keep: number },
) {
  if (!options.enabled) return;
  try {
    if (await hasData(db)) await createLocalBackup(db, reason, options.keep);
  } catch {
    // A failed safety backup must not prevent the action the user asked for.
  }
}

export async function readLocalBackup(name: string): Promise<Snapshot> {
  return parseBackup(await new File(folder(), name).text());
}

export function deleteLocalBackup(name: string) {
  const file = new File(folder(), name);
  if (file.exists) file.delete();
}
