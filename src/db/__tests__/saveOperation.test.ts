import type { NewTransaction } from '@/domain/types';

import { migrate } from '../migrations';
import { openTestDatabase } from '../nodeTestDatabase';
import * as repo from '../repo';

/** The Add / Edit operation form's save, on real SQLite. */
describe('saveOperation', () => {
  async function setup() {
    const db = openTestDatabase();
    await migrate(db);
    const categories = (await repo.loadSnapshot(db)).categories;
    const cat = (name: string) => categories.find((c) => c.name === name)!.id;
    const accountId = await repo.insertAccount(db, { name: 'Bank' });
    const world = await repo.insertAsset(db, { accountId, categoryId: cat('ETF'), name: 'World', identifier: null, valuation: 'units' });
    const livret = await repo.insertAsset(db, { accountId, categoryId: cat('Cash'), name: 'Livret A', identifier: null, valuation: 'balance' });
    return { db, accountId, world, livret };
  }
  const snapshot = (db: ReturnType<typeof openTestDatabase>) => repo.loadSnapshot(db);
  const buy = (date = '2026-06-15'): NewTransaction => ({
    assetId: 0,
    type: 'BUY',
    date,
    quantity: 2,
    unitPrice: 500,
    amount: 1000,
    fees: 2,
    note: null,
  });
  const withdraw = (assetId: number, amount = 1002): NewTransaction => ({
    assetId,
    type: 'WITHDRAW',
    date: '2026-06-15',
    quantity: null,
    unitPrice: null,
    amount,
    fees: 0,
    note: 'Buy 2 × World',
  });

  it('creates the investment with its new account and category, and the linked cash side', async () => {
    const { db, livret } = await setup();
    const id = await repo.saveOperation(db, {
      asset: {
        account: { name: 'Broker' },
        category: { name: 'Robots', kind: 'asset', valuation: 'units', color: '#2a78d6' },
        name: 'Robo ETF',
        identifier: 'BOTZ',
        valuation: 'units',
        note: null,
      },
      price: null,
      transactions: [buy()],
      cash: withdraw(livret),
    });
    const s = await snapshot(db);
    const asset = s.assets.find((a) => a.id === id)!;
    expect(asset).toMatchObject({ name: 'Robo ETF', identifier: 'BOTZ' });
    expect(s.accounts.find((a) => a.id === asset.accountId)?.name).toBe('Broker');
    expect(s.categories.find((c) => c.id === asset.categoryId)?.name).toBe('Robots');
    const main = s.transactions.find((t) => t.assetId === id)!;
    const side = s.transactions.find((t) => t.assetId === livret)!;
    expect(main).toMatchObject({ type: 'BUY', amount: 1000, linkedId: side.id });
    expect(side).toMatchObject({ type: 'WITHDRAW', amount: 1002, linkedId: main.id });
  });

  it('edits a transaction and removes its cash side when set to "Not tracked"', async () => {
    const { db, world, livret } = await setup();
    await repo.saveOperation(db, { asset: world, price: null, transactions: [buy()], cash: withdraw(livret) });
    const tx = (await snapshot(db)).transactions.find((t) => t.assetId === world)!;

    await repo.saveOperation(db, {
      asset: world,
      price: null,
      transactions: [{ ...buy(), quantity: 3, amount: 1500 }],
      cash: null,
      edit: { transaction: tx },
    });
    const after = (await snapshot(db)).transactions;
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: tx.id, quantity: 3, amount: 1500, linkedId: null, createdAt: tx.createdAt });
  });

  it('moves an edited price to another day, keeping its save time', async () => {
    const { db, world } = await setup();
    await repo.saveOperation(db, { asset: world, price: { date: '2026-06-10', price: 480 }, transactions: [], cash: null });
    const price = (await snapshot(db)).prices[0];

    await repo.saveOperation(db, {
      asset: world,
      price: { date: '2026-06-12', price: 490 },
      transactions: [],
      cash: null,
      edit: { price },
    });
    const prices = (await snapshot(db)).prices;
    expect(prices).toHaveLength(1);
    expect(prices[0]).toMatchObject({ date: '2026-06-12', price: 490, createdAt: price.createdAt });
  });

  it('inserts every planned transaction (loan repayments) and links cash to the first only', async () => {
    const { db, world, livret } = await setup();
    await repo.saveOperation(db, {
      asset: world,
      price: null,
      transactions: [buy('2026-06-15'), buy('2026-07-15')],
      cash: withdraw(livret),
    });
    const txs = (await snapshot(db)).transactions;
    expect(txs.filter((t) => t.assetId === world)).toHaveLength(2);
    expect(txs.filter((t) => t.assetId === livret)).toHaveLength(1);
  });
});
