import { backupFileName, backupsToPrune, needsDailyBackup, parseBackupFileName, sortBackups } from '../autoBackupRules';

const at = (y: number, mo: number, d: number, h = 9, mi = 15, s = 30) => new Date(y, mo - 1, d, h, mi, s);

describe('auto backup rules', () => {
  it('names files so they sort chronologically, and parses them back', () => {
    const name = backupFileName('daily', at(2026, 10, 3, 8, 5, 9));
    expect(name).toBe('2026-10-03T080509_daily.json');
    expect(parseBackupFileName(name)).toEqual({ name, date: at(2026, 10, 3, 8, 5, 9), reason: 'daily' });
    expect(parseBackupFileName('pocket-ledger-backup-2026-10-03.json')).toBeNull();
    expect(parseBackupFileName('2026-10-03T080509_unknown.json')).toBeNull();
  });

  it('needs one daily backup per day, other reasons do not count', () => {
    const names = ['2026-10-09T200000_daily.json', '2026-10-10T080000_before-reset.json'];
    expect(needsDailyBackup(names, at(2026, 10, 10))).toBe(true);
    expect(needsDailyBackup([...names, '2026-10-10T090000_daily.json'], at(2026, 10, 10, 18))).toBe(false);
  });

  it('keeps the N most recent backups and ignores unrelated files', () => {
    const names = [
      '2026-10-01T090000_daily.json',
      '2026-10-03T090000_daily.json',
      'notes.txt',
      '2026-10-02T090000_before-restore.json',
      '2026-10-04T090000_daily.json',
    ];
    expect(sortBackups(names).map((b) => b.name.slice(0, 10))).toEqual(['2026-10-04', '2026-10-03', '2026-10-02', '2026-10-01']);
    expect(backupsToPrune(names, 2)).toEqual(['2026-10-02T090000_before-restore.json', '2026-10-01T090000_daily.json']);
    expect(backupsToPrune(names, 10)).toEqual([]);
  });
});
