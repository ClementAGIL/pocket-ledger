import { resetWithDemoData } from '../demo';
import { migrate } from '../migrations';
import { openTestDatabase } from '../nodeTestDatabase';
import * as repo from '../repo';

async function demoDatabase() {
  const db = openTestDatabase();
  await migrate(db);
  await db.withExclusiveTransactionAsync((txn) => resetWithDemoData(txn));
  return db;
}

describe('undo a deletion (real SQLite)', () => {
  it('restores a deleted investment with its whole history, identical', async () => {
    const db = await demoDatabase();
    const before = await repo.loadSnapshot(db);
    const asset = before.assets.find((a) => a.name === 'Apple')!;
    const txs = before.transactions.filter((t) => t.assetId === asset.id);
    const prices = before.prices.filter((p) => p.assetId === asset.id);
    expect(txs.length).toBeGreaterThan(0);

    await repo.deleteAsset(db, asset.id);
    const deleted = await repo.loadSnapshot(db);
    expect(deleted.assets.some((a) => a.id === asset.id)).toBe(false);
    expect(deleted.transactions.some((t) => t.assetId === asset.id)).toBe(false);

    await repo.restoreAsset(db, asset, txs, prices);
    expect(await repo.loadSnapshot(db)).toEqual(before);
  });

  it('restores a deleted operation and a deleted price update', async () => {
    const db = await demoDatabase();
    const before = await repo.loadSnapshot(db);
    const tx = before.transactions[10];
    const price = before.prices[10];

    await repo.deleteTransaction(db, tx.id);
    await repo.deletePrice(db, price.id);
    await repo.restoreTransaction(db, tx);
    await repo.restorePrice(db, price);
    expect(await repo.loadSnapshot(db)).toEqual(before);
  });
});
