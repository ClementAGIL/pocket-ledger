import type { Snapshot } from '@/domain/types';

import { parseBackup, serializeBackup } from '../format';

const snapshot: Snapshot = {
  schedules: [
    { id: 1, assetId: 1, type: 'BUY', amount: 200, day: 5, startDate: '2024-03-01', doneUntil: '2024-03-05', cashAssetId: null, rate: null, createdAt: '2024-03-01 09:00:00' },
  ],
  categories: [{ id: 1, name: 'ETF', kind: 'asset', valuation: 'units', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' }],
  accounts: [{ id: 1, name: 'Broker', institution: null, note: null, archived: false, createdAt: '2024-01-01 00:00:00' }],
  assets: [
    { id: 1, accountId: 1, categoryId: 1, name: 'World', identifier: 'CW8', valuation: 'units', note: null, reviewDate: null, archived: false, createdAt: '' },
  ],
  transactions: [
    { id: 1, assetId: 1, type: 'BUY', date: '2024-01-01', quantity: 1.5, unitPrice: 100, amount: 150, fees: 1, note: null, linkedId: null, createdAt: '2024-01-01 10:00:00' },
  ],
  prices: [{ id: 1, assetId: 1, date: '2024-02-01', price: 110, source: 'manual', createdAt: '2024-02-01 18:00:00' }],
};

describe('backup format', () => {
  it('round-trips a snapshot', () => {
    expect(parseBackup(serializeBackup(snapshot))).toEqual(snapshot);
  });

  it('drops a link to a missing transaction, and refuses unsupported format versions', () => {
    const file = JSON.parse(serializeBackup(snapshot));
    file.data.transactions[0].linkedId = 12345;
    expect(parseBackup(JSON.stringify(file)).transactions[0].linkedId).toBeNull();
    const old = JSON.parse(serializeBackup(snapshot));
    old.formatVersion = 7;
    expect(() => parseBackup(JSON.stringify(old))).toThrow(/unsupported format version 7/);
    const noSource = JSON.parse(serializeBackup(snapshot));
    delete noSource.data.prices[0].source;
    expect(() => parseBackup(JSON.stringify(noSource))).toThrow();
  });

  it('reads version 8 files, which have no scheduled operations', () => {
    const v8 = JSON.parse(serializeBackup(snapshot));
    v8.formatVersion = 8;
    delete v8.data.schedules;
    expect(parseBackup(JSON.stringify(v8)).schedules).toEqual([]);
  });

  it('forgets a missing paid-from cash asset of a scheduled operation', () => {
    const file = JSON.parse(serializeBackup(snapshot));
    file.data.schedules[0].cashAssetId = 99;
    expect(parseBackup(JSON.stringify(file)).schedules[0].cashAssetId).toBeNull();
  });

  it('rejects files that are not Pocket Ledger backups', () => {
    expect(() => parseBackup('not json')).toThrow('not valid JSON');
    expect(() => parseBackup('{"app":"other"}')).toThrow('not a Pocket Ledger backup');
  });

  it('rejects dangling references and bad dates', () => {
    const bad = JSON.parse(serializeBackup(snapshot));
    bad.data.assets[0].accountId = 42;
    expect(() => parseBackup(JSON.stringify(bad))).toThrow('unknown account');

    const badDate = JSON.parse(serializeBackup(snapshot));
    badDate.data.transactions[0].date = '2024-02-31';
    expect(() => parseBackup(JSON.stringify(badDate))).toThrow('transaction date');
  });
});
