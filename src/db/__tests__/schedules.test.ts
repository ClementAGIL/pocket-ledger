import { buildPortfolio } from '@/domain/portfolio';
import { draftOccurrences, dueOccurrences, occurrenceRecords } from '@/domain/schedules';

import { migrate } from '../migrations';
import { openTestDatabase } from '../nodeTestDatabase';
import * as repo from '../repo';

/** Scheduled operations on real SQLite: saving the due ones, undo, and deleting the investment. */
describe('scheduled operations', () => {
  async function setup() {
    const db = openTestDatabase();
    await migrate(db);
    const categories = (await repo.loadSnapshot(db)).categories;
    const cat = (name: string) => categories.find((c) => c.name === name)!.id;
    const accountId = await repo.insertAccount(db, { name: 'Bank' });
    const world = await repo.insertAsset(db, { accountId, categoryId: cat('ETF'), name: 'World', identifier: null, valuation: 'units' });
    const loan = await repo.insertAsset(db, { accountId, categoryId: cat('Loan'), name: 'Mortgage', identifier: null, valuation: 'balance' });
    const checking = await repo.insertAsset(db, { accountId, categoryId: cat('Cash'), name: 'Checking', identifier: null, valuation: 'balance' });
    await repo.insertTransaction(db, { assetId: world, type: 'BUY', date: '2026-01-02', quantity: 1, unitPrice: 100, amount: 100, fees: 0, note: null });
    await repo.insertTransaction(db, { assetId: loan, type: 'DEPOSIT', date: '2026-01-02', quantity: null, unitPrice: null, amount: 120000, fees: 0, note: null });
    await repo.insertTransaction(db, { assetId: checking, type: 'DEPOSIT', date: '2026-01-02', quantity: null, unitPrice: null, amount: 5000, fees: 0, note: null });
    const buy = await repo.insertSchedule(db, { assetId: world, type: 'BUY', amount: 200, day: 5, startDate: '2026-01-05', cashAssetId: checking, rate: null });
    const pay = await repo.insertSchedule(db, { assetId: loan, type: 'WITHDRAW', amount: 800, day: 10, startDate: '2026-01-10', cashAssetId: checking, rate: 0.03 });
    return { db, world, loan, checking, buy, pay };
  }

  /** Reviews everything due on `today` as proposed, like the review screen with nothing changed. */
  async function saveDue(db: ReturnType<typeof openTestDatabase>, today: string) {
    const snapshot = await repo.loadSnapshot(db);
    const due = dueOccurrences(snapshot.schedules, buildPortfolio(snapshot).byAssetId, today);
    const drafts = draftOccurrences(due, () => 100);
    const items = due.map((o, i) => {
      const r = occurrenceRecords(o, drafts[i], o.schedule.cashAssetId);
      if (!('records' in r)) throw new Error(r.error);
      return { scheduleId: o.schedule.id, date: o.date, records: r.records };
    });
    const previous = new Map(due.map((o) => [o.schedule.id, o.schedule.doneUntil]));
    return { ids: await repo.saveScheduled(db, items), previous, count: due.length };
  }

  it('saves the due months, then nothing is due until next month; undo makes them due again', async () => {
    const { db, world, loan, checking } = await setup();
    const { ids, previous, count } = await saveDue(db, '2026-02-20');
    expect(count).toBe(4);
    expect(ids).toHaveLength(8);

    let snapshot = await repo.loadSnapshot(db);
    let portfolio = buildPortfolio(snapshot);
    expect(dueOccurrences(snapshot.schedules, portfolio.byAssetId, '2026-02-20')).toHaveLength(0);
    // Two buys of 2 shares, linked to their payment; the loan lost only its principal (500 + 501.25).
    expect(portfolio.byAssetId.get(world)!.position.quantity).toBe(5);
    expect(portfolio.byAssetId.get(loan)!.position.value).toBeCloseTo(120000 - 500 - 501.25, 2);
    expect(portfolio.byAssetId.get(checking)!.position.value).toBe(5000 - 400 - 1600);
    const buys = snapshot.transactions.filter((t) => t.assetId === world && t.linkedId !== null);
    expect(buys).toHaveLength(2);
    expect(snapshot.transactions.filter((t) => t.assetId === loan && t.type === 'WITHDRAW').map((t) => t.fees)).toEqual([300, 298.75]);

    await repo.undoScheduled(db, ids, previous);
    snapshot = await repo.loadSnapshot(db);
    portfolio = buildPortfolio(snapshot);
    expect(snapshot.transactions).toHaveLength(3);
    expect(dueOccurrences(snapshot.schedules, portfolio.byAssetId, '2026-02-20')).toHaveLength(4);
  });

  it('a new start date restarts the schedule', async () => {
    const { db, buy, world, checking } = await setup();
    await saveDue(db, '2026-02-20');
    const input = { assetId: world, type: 'BUY' as const, amount: 300, day: 5, startDate: '2026-03-01', cashAssetId: checking, rate: null };
    await repo.updateSchedule(db, buy, input, true);
    const s = (await repo.loadSnapshot(db)).schedules.find((x) => x.id === buy)!;
    expect(s).toMatchObject({ amount: 300, startDate: '2026-03-01', doneUntil: null });
  });

  it('deleting an investment removes its schedules and forgets it as a paid-from account; undo restores both', async () => {
    const { db, world, checking, buy, pay } = await setup();
    const before = await repo.loadSnapshot(db);
    const asset = before.assets.find((a) => a.id === checking)!;
    const own = before.schedules.filter((s) => s.assetId === checking);
    const paidFrom = before.schedules.filter((s) => s.cashAssetId === checking).map((s) => s.id);
    await repo.deleteAsset(db, checking);
    let after = await repo.loadSnapshot(db);
    expect(after.schedules.map((s) => s.cashAssetId)).toEqual([null, null]);

    await repo.restoreAsset(
      db,
      asset,
      before.transactions.filter((t) => t.assetId === checking),
      [],
      { own, paidFrom },
    );
    after = await repo.loadSnapshot(db);
    expect(after.schedules).toEqual(before.schedules);

    // Deleting the investment of a schedule deletes it.
    await repo.deleteAsset(db, world);
    expect((await repo.loadSnapshot(db)).schedules.map((s) => s.id)).toEqual([pay]);
    expect(buy).not.toBe(pay);
  });

  it('survives a full replace (backup restore)', async () => {
    const { db } = await setup();
    await saveDue(db, '2026-02-20');
    const snapshot = await repo.loadSnapshot(db);
    const other = openTestDatabase();
    await migrate(other);
    await repo.replaceAll(other, snapshot);
    expect((await repo.loadSnapshot(other)).schedules).toEqual(snapshot.schedules);
  });
});
