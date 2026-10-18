import { errorMessage, isDuplicateName } from '../errors';
import { migrate } from '../migrations';
import { openTestDatabase } from '../nodeTestDatabase';
import * as repo from '../repo';

describe('save errors', () => {
  it('recognizes a duplicate account or category name from SQLite itself', async () => {
    const db = openTestDatabase();
    await migrate(db);
    await repo.insertAccount(db, { name: 'Bank' });
    const account = await repo.insertAccount(db, { name: 'bank' }).catch((e: unknown) => e);
    expect(isDuplicateName(account)).toBe(true);
    const category = await repo
      .insertCategory(db, { name: 'etf', kind: 'asset', valuation: 'units', color: '#2a78d6' })
      .catch((e: unknown) => e);
    expect(isDuplicateName(category)).toBe(true);
  });

  it('leaves other errors as they are', () => {
    expect(isDuplicateName(new Error('disk I/O error'))).toBe(false);
    expect(errorMessage(new Error('disk I/O error'))).toBe('disk I/O error');
    expect(errorMessage('oops')).toBe('oops');
  });
});
