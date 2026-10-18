import { migrate } from '../migrations';
import { openTestDatabase } from '../nodeTestDatabase';
import * as repo from '../repo';

/** A buy paid from a cash account: two transactions pointing to each other (`linked_id`). */
describe('linked cash transactions', () => {
  async function setup() {
    const db = openTestDatabase();
    await migrate(db);
    const categories = (await repo.loadSnapshot(db)).categories;
    const cat = (name: string) => categories.find((c) => c.name === name)!.id;
    const accountId = await repo.insertAccount(db, { name: 'Bank' });
    const world = await repo.insertAsset(db, { accountId, categoryId: cat('ETF'), name: 'World', identifier: null, valuation: 'units' });
    const livret = await repo.insertAsset(db, { accountId, categoryId: cat('Cash'), name: 'Livret A', identifier: null, valuation: 'balance' });
    const current = await repo.insertAsset(db, { accountId, categoryId: cat('Cash'), name: 'Current', identifier: null, valuation: 'balance' });
    const buy = await repo.insertTransaction(db, { assetId: world, type: 'BUY', date: '2026-06-15', quantity: 2, unitPrice: 500, amount: 1000, fees: 2, note: null });
    const cash = { assetId: livret, type: 'WITHDRAW' as const, date: '2026-06-15', quantity: null, unitPrice: null, amount: 1002, fees: 0, note: 'Buy 2 × World' };
    return { db, world, livret, current, buy, cash };
  }
  const txs = async (db: ReturnType<typeof openTestDatabase>) => (await repo.loadSnapshot(db)).transactions;

  it('creates, updates, moves and removes the cash side', async () => {
    const { db, livret, current, buy, cash } = await setup();
    await repo.syncLinkedCash(db, buy, null, cash);
    let [main, side] = await txs(db);
    expect(main.linkedId).toBe(side.id);
    expect(side).toMatchObject({ assetId: livret, type: 'WITHDRAW', amount: 1002, linkedId: main.id });

    // Edited buy: the withdrawal follows, even to another cash account.
    await repo.syncLinkedCash(db, buy, side.id, { ...cash, assetId: current, amount: 1502 });
    [main, side] = await txs(db);
    expect(side).toMatchObject({ assetId: current, amount: 1502, linkedId: main.id });

    // "Not tracked": the withdrawal goes, the buy loses its link.
    await repo.syncLinkedCash(db, buy, side.id, null);
    const after = await txs(db);
    expect(after).toHaveLength(1);
    expect(after[0].linkedId).toBeNull();
  });

  it('keeps the cash movement when the investment is deleted, and relinks it on undo', async () => {
    const { db, world, buy, cash } = await setup();
    await repo.syncLinkedCash(db, buy, null, cash);
    const snapshot = await repo.loadSnapshot(db);
    const asset = snapshot.assets.find((a) => a.id === world)!;
    const worldTxs = snapshot.transactions.filter((t) => t.assetId === world);

    await repo.deleteAsset(db, world);
    const left = await txs(db);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ type: 'WITHDRAW', linkedId: null });

    await repo.restoreAsset(db, asset, worldTxs, []);
    const [main, side] = await txs(db);
    expect(main.linkedId).toBe(side.id);
    expect(side.linkedId).toBe(main.id);
  });
});
