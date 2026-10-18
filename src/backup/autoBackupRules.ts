/*
 * Rules for automatic local backups (pure, no file system):
 * - one "daily" backup before the first change of a day, so you can always go back to how things
 *   were before today's edits;
 * - one before every risky action (restore, demo reset, delete all);
 * - only the most recent N are kept.
 * File names sort chronologically: "2026-10-10T091530_daily.json".
 */

export type BackupReason = 'daily' | 'before-restore' | 'before-reset' | 'before-delete';

export const BACKUP_REASON_LABELS: Record<BackupReason, string> = {
  daily: 'Before the first change of the day',
  'before-restore': 'Before restoring a backup',
  'before-reset': 'Before loading demo data',
  'before-delete': 'Before deleting all data',
};

const pad = (n: number) => String(n).padStart(2, '0');

export function backupFileName(reason: BackupReason, now: Date): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}T${time}_${reason}.json`;
}

export interface BackupFileInfo {
  name: string;
  /** Local date-time of the backup. */
  date: Date;
  reason: BackupReason;
}

const NAME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})_([a-z-]+)\.json$/;

/** Null for files that are not automatic backups. */
export function parseBackupFileName(name: string): BackupFileInfo | null {
  const m = NAME.exec(name);
  if (!m || !(m[7] in BACKUP_REASON_LABELS)) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  return { name, date: new Date(y, mo - 1, d, h, mi, s), reason: m[7] as BackupReason };
}

/** Backups, newest first. Unrelated files are ignored. */
export function sortBackups(names: string[]): BackupFileInfo[] {
  return names
    .map(parseBackupFileName)
    .filter((b): b is BackupFileInfo => b !== null)
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** True when no daily backup was made today yet. */
export function needsDailyBackup(names: string[], now: Date): boolean {
  const today = backupFileName('daily', now).slice(0, 10);
  return !names.some((n) => n.startsWith(today) && n.endsWith('_daily.json'));
}

/** Names to delete so that only the `keep` most recent backups remain. */
export function backupsToPrune(names: string[], keep: number): string[] {
  return sortBackups(names)
    .slice(keep)
    .map((b) => b.name);
}
