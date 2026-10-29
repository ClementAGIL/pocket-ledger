import { migrate, SCHEMA_VERSION } from '../migrations';
import { openTestDatabase } from '../nodeTestDatabase';
import * as repo from '../repo';

describe('price source', () => {
  it('stores where a price comes from, and a same-day update replaces it', async () => {
    const db = openTestDatabase();
    await migrate(db);
    const accountId = await repo.insertAccount(db, { name: 'Broker' });
    const category = (await repo.loadSnapshot(db)).categories.find((c) => c.name === 'ETF')!;
    const assetId = await repo.insertAsset(db, { accountId, categoryId: category.id, name: 'World', identifier: 'IWDA.AS', valuation: 'units' });

    await repo.upsertPrice(db, { assetId, date: '2026-10-09', price: 130 });
    await repo.upsertPrice(db, { assetId, date: '2026-10-11', price: 131, source: 'online' });
    let prices = (await repo.loadSnapshot(db)).prices;
    expect(prices.map((p) => [p.date, p.price, p.source])).toEqual([
      ['2026-10-09', 130, 'manual'],
      ['2026-10-11', 131, 'online'],
    ]);

    // Typed again by hand the same day: the price and its source are replaced.
    await repo.upsertPrice(db, { assetId, date: '2026-10-11', price: 132 });
    prices = (await repo.loadSnapshot(db)).prices;
    expect(prices[1]).toMatchObject({ price: 132, source: 'manual' });

    // Undo path: the row comes back with its id and source.
    const online = { ...prices[1], price: 131, source: 'online' as const };
    await repo.deletePriceOn(db, assetId, '2026-10-11');
    await repo.restorePrice(db, online);
    expect((await repo.loadSnapshot(db)).prices[1]).toEqual(online);
  });
});

describe('save time', () => {
  it('stamps prices when saved and keeps the stamp on restore', async () => {
    const db = openTestDatabase();
    await migrate(db);
    const accountId = await repo.insertAccount(db, { name: 'Broker' });
    const category = (await repo.loadSnapshot(db)).categories.find((c) => c.name === 'ETF')!;
    const assetId = await repo.insertAsset(db, { accountId, categoryId: category.id, name: 'World', identifier: null, valuation: 'units' });
    await repo.upsertPrice(db, { assetId, date: '2026-10-11', price: 130 });
    await repo.insertTransaction(db, { assetId, type: 'BUY', date: '2026-10-11', quantity: 1, unitPrice: 130, amount: 130, fees: 0, note: null });
    const { prices, transactions } = await repo.loadSnapshot(db);
    expect(prices[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(transactions[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    // Undo / restore keeps the original time.
    const old = { ...prices[0], createdAt: '2026-10-11 08:00:00' };
    await repo.deletePrice(db, old.id);
    await repo.restorePrice(db, old);
    expect((await repo.loadSnapshot(db)).prices[0].createdAt).toBe('2026-10-11 08:00:00');
  });
});

describe('database version newer than the app', () => {
  it('is recreated in development and refused otherwise', async () => {
    const db = openTestDatabase();
    await migrate(db);
    await repo.insertAccount(db, { name: 'Old' });
    await db.execAsync('PRAGMA user_version = 8');
    await expect(migrate(db, { isDev: false })).rejects.toThrow(/newer than this app/);

    await migrate(db, { isDev: true });
    const snapshot = await repo.loadSnapshot(db);
    expect(snapshot.accounts).toEqual([]);
    expect(snapshot.categories.find((c) => c.name === 'Real estate')!.updateReminder).toBe('never');
    expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version).toBe(SCHEMA_VERSION);
  });
});
