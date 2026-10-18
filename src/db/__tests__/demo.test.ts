import { today } from '@/domain/dates';
import { buildPortfolio } from '@/domain/portfolio';
import { monthsToReach, savingPace } from '@/domain/projection';
import { buildReturns } from '@/domain/returns';
import { reviewsDue } from '@/domain/reviews';

import { resetWithDemoData } from '../demo';
import { migrate } from '../migrations';
import { loadSnapshot } from '../repo';
import { openTestDatabase } from '../nodeTestDatabase';

describe('demo data (real migrations + repository on SQLite)', () => {
  it('creates notes and due reviews', async () => {
    const db = openTestDatabase();
    await migrate(db);
    await db.withExclusiveTransactionAsync((txn) => resetWithDemoData(txn));
    const snapshot = await loadSnapshot(db);

    const peloton = snapshot.assets.find((a) => a.name === 'Peloton')!;
    expect(peloton.note).toContain('connected fitness');
    expect(peloton.reviewDate).not.toBeNull();

    const due = reviewsDue(buildPortfolio(snapshot).byAssetId.values(), today()).map((v) => v.asset.name);
    expect(due).toEqual(expect.arrayContaining(['Peloton', 'Apple', 'BNP S&P 500', 'Ethereum']));

    // Real estate is exempt from update reminders (Real estate: never), other categories are monthly.
    expect(snapshot.categories.find((c) => c.name === 'Real estate')!.updateReminder).toBe('never');
    expect(snapshot.categories.find((c) => c.name === 'ETF')!.updateReminder).toBe('monthly');

    // Linked cash transfers: 3 buys paid from the checking account, linked both ways.
    const linked = snapshot.transactions.filter((t) => t.linkedId != null);
    expect(linked).toHaveLength(6);
    for (const t of linked) expect(snapshot.transactions.find((o) => o.id === t.linkedId)!.linkedId).toBe(t.id);

    // Price source: a few recent prices were fetched online, the rest typed.
    const online = snapshot.prices.filter((p) => p.source === 'online');
    expect(online.length).toBe(9);
    expect(snapshot.prices.some((p) => p.source === 'manual')).toBe(true);

    // Target allocation adds up to 100%.
    const targets = snapshot.categories.filter((c) => c.targetWeight !== null);
    expect(targets.reduce((s, c) => s + c.targetWeight!, 0)).toBeCloseTo(1, 10);
  });

  it('gives the simulation a realistic pace and rate', async () => {
    const db = openTestDatabase();
    await migrate(db);
    await db.withExclusiveTransactionAsync((txn) => resetWithDemoData(txn));
    const snapshot = await loadSnapshot(db);
    const portfolio = buildPortfolio(snapshot);

    const pace = savingPace(snapshot, today());
    const rate = buildReturns(portfolio, today()).total.rate!;
    expect(pace.months).toBeGreaterThan(6);
    expect(pace.yearly).toBeGreaterThan(0);
    expect(rate).toBeGreaterThan(-0.5);
    expect(monthsToReach(portfolio.summary.assetsValue * 2, { start: portfolio.summary.assetsValue, yearlySaving: pace.yearly, rate })).not.toBeNull();
  });
});
