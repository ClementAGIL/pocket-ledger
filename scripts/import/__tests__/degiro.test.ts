import { parseBackup, serializeBackup } from '@/backup/format';
import { computePosition } from '@/domain/positions';
import type { Snapshot } from '@/domain/types';

import { convertDegiro } from '../degiro';
import { heldMonthEnds, mergeAccount } from '../ledger';

// Same layout as a real DEGIRO statement (newest first), invented amounts.
const CSV = `Date,Heure,Date de,Produit,Code ISIN,Description,FX,Mouvements,,Solde,,ID Ordre
12-10-2026,04:09,12-10-2026,,,Degiro Cash Sweep Transfer,,EUR,"-19,15",EUR,"435,00",
10-10-2026,06:41,09-10-2026,,,Operation de change - Crédit,,EUR,"19,15",EUR,"454,15",
10-10-2026,06:41,09-10-2026,,,Opération de change - Débit,"1,1229",USD,"-21,50",USD,"0,00",
09-10-2026,07:37,08-10-2026,VICI PROPERTIES INC,US9256521090,Dividende,,USD,"25,30",USD,"21,50",
09-10-2026,07:37,08-10-2026,VICI PROPERTIES INC,US9256521090,Impôts sur dividende,,USD,"-3,80",USD,"-3,80",
17-11-2025,10:41,17-11-2025,"NETFLIX, INC.",US64110L1061,"Ajustement fractionnement: 40 Netflix, Inc. @ 111,217 USD (US64110L1061)",,USD,"-4448,68",USD,"0,00",
17-11-2025,10:41,17-11-2025,"NETFLIX, INC.",US64110L1061,"Ajustement fractionnement: 4 Netflix, Inc. @ 1 112,17 USD (US64110L1061)",,USD,"4448,68",USD,"4448,68",
17-10-2023,18:17,17-10-2023,FLATEX EURO BANKACCOUNT,NLFLATEXACNT,Degiro Cash Sweep Transfer,,EUR,"-448,66",EUR,"189,86",
17-10-2023,07:00,16-10-2023,,,Operation de change - Crédit,,EUR,"448,66",EUR,"448,66",
17-10-2023,07:00,16-10-2023,,,Opération de change - Débit,"1,0587",USD,"-475,00",USD,"0,00",
16-10-2023,11:07,13-10-2023,ACTIVISION BLIZZARD INC,US00507V1098,Règlement espèces opérations sur titres - Action,,USD,"475,00",USD,"475,00",
16-10-2023,11:07,13-10-2023,ACTIVISION BLIZZARD INC,US00507V1098,Delisting: Vente 5 Activision Blizzard Inc@0 USD (US00507V1098),,USD,"0,00",USD,"0,00",
05-02-2024,07:18,31-01-2024,,,Frais de connexion aux places boursières 2024 (Nasdaq - NDQ),,EUR,"-2,50",EUR,"665,55",
03-05-2022,16:07,03-05-2022,"NETFLIX, INC.",US64110L1061,Operation de change - Crédit,"1,0519",USD,"399,56",USD,"0,00",596ab53c
03-05-2022,16:07,03-05-2022,"NETFLIX, INC.",US64110L1061,Opération de change - Débit,,EUR,"-379,86",EUR,"1290,49",596ab53c
03-05-2022,16:07,03-05-2022,"NETFLIX, INC.",US64110L1061,Frais DEGIRO de courtage et/ou de parties tierces,,EUR,"-0,50",EUR,"1670,35",596ab53c
03-05-2022,16:07,03-05-2022,"NETFLIX, INC.",US64110L1061,"Achat 2 Netflix, Inc.@199,78 USD (US64110L1061)",,USD,"-399,56",USD,"-399,56",596ab53c
26-01-2022,15:47,26-01-2022,"NETFLIX, INC.",US64110L1061,Operation de change - Crédit,"1,1260",USD,"758,20",USD,"0,00",6d23dcfe
26-01-2022,15:47,26-01-2022,"NETFLIX, INC.",US64110L1061,Opération de change - Débit,,EUR,"-673,37",EUR,"679,16",6d23dcfe
26-01-2022,15:47,26-01-2022,"NETFLIX, INC.",US64110L1061,Frais DEGIRO de courtage et/ou de parties tierces,,EUR,"-0,50",EUR,"1352,53",6d23dcfe
26-01-2022,15:47,26-01-2022,"NETFLIX, INC.",US64110L1061,"Achat 2 Netflix, Inc.@379,1 USD (US64110L1061)",,USD,"-758,20",USD,"-758,20",6d23dcfe
26-01-2022,15:35,26-01-2022,ACTIVISION BLIZZARD INC,US00507V1098,Operation de change - Crédit,"1,1263",USD,"395,95",USD,"0,00",ea635a55
26-01-2022,15:35,26-01-2022,ACTIVISION BLIZZARD INC,US00507V1098,Opération de change - Débit,,EUR,"-351,56",EUR,"1773,03",ea635a55
26-01-2022,15:35,26-01-2022,ACTIVISION BLIZZARD INC,US00507V1098,Frais DEGIRO de courtage et/ou de parties tierces,,EUR,"-0,50",EUR,"2124,59",ea635a55
26-01-2022,15:35,26-01-2022,ACTIVISION BLIZZARD INC,US00507V1098,"Achat 5 Activision Blizzard Inc@79,19 USD (US00507V1098)",,USD,"-395,95",USD,"-395,95",ea635a55
26-01-2022,13:40,26-01-2022,,,Dépôt flatex,,EUR,"2000,00",EUR,"2125,09",
16-07-2021,16:00,16-07-2021,VICI PROPERTIES INC,US9256521090,Operation de change - Crédit,"1,1791",USD,"300,00",USD,"0,00",9cd72acb
16-07-2021,16:00,16-07-2021,VICI PROPERTIES INC,US9256521090,Opération de change - Débit,,EUR,"-254,44",EUR,"145,56",9cd72acb
16-07-2021,16:00,16-07-2021,VICI PROPERTIES INC,US9256521090,"Achat 10 VICI Properties Inc@30 USD (US9256521090)",,USD,"-300,00",USD,"-300,00",9cd72acb
16-07-2021,13:30,16-07-2021,,,Dépôt flatex,,EUR,"400,00",EUR,"400,00",
`;

function load(snapshot: Snapshot, name: string) {
  const asset = snapshot.assets.find((a) => a.name === name)!;
  return computePosition(
    asset.valuation,
    snapshot.transactions.filter((t) => t.assetId === asset.id),
    snapshot.prices.filter((p) => p.assetId === asset.id),
  );
}

describe('convertDegiro', () => {
  const { account, warnings } = convertDegiro(CSV);
  const { snapshot } = mergeAccount(null, account, new Date('2026-10-28T12:00:00Z'));

  it('understands every line', () => {
    expect(warnings).toEqual([]);
  });

  it('books buys in the euros really paid, with fees, paid from the cash', () => {
    const vici = load(snapshot, 'VICI Properties Inc');
    expect(vici.quantity).toBe(10);
    expect(vici.invested).toBeCloseTo(254.44, 2);
    const buy = snapshot.transactions.find((t) => t.type === 'BUY' && t.amount === 254.44)!;
    const side = snapshot.transactions.find((t) => t.id === buy.linkedId)!;
    expect(side).toMatchObject({ type: 'WITHDRAW', amount: 254.44, linkedId: buy.id });
  });

  it('converts dividends with the EUR of the next conversion, net of tax', () => {
    const vici = load(snapshot, 'VICI Properties Inc');
    expect(vici.income).toBeCloseTo(19.15, 2);
  });

  it('restates quantities before a split, keeping the money', () => {
    const netflix = load(snapshot, 'Netflix, Inc.');
    expect(netflix.quantity).toBe(40);
    expect(netflix.invested).toBeCloseTo(673.37 + 0.5 + 379.86 + 0.5, 2);
    expect(netflix.realized).toBe(0);
  });

  it('sells delisted shares at the cash settlement', () => {
    const activision = load(snapshot, 'Activision Blizzard Inc');
    expect(activision.quantity).toBe(0);
    expect(activision.realized).toBeCloseTo(448.66 - 352.06, 2);
  });

  it('keeps the cash to the cent: deposits, trades, dividends, fees, sweeps ignored', () => {
    const cash = load(snapshot, 'DEGIRO cash');
    const expected = 400 + 2000 - 254.44 - 352.06 - 673.87 - 380.36 - 2.5 + 448.66 + 19.15;
    expect(cash.value).toBeCloseTo(expected, 2);
  });

  it('writes a backup the app can restore', () => {
    expect(() => parseBackup(serializeBackup(snapshot))).not.toThrow();
  });
});

describe('mergeAccount', () => {
  const { account } = convertDegiro(CSV);
  const first = mergeAccount(null, account).snapshot;

  it('replaces only the account it imports, keeping the others', () => {
    const other = mergeAccount(first, { ...account, name: 'Other broker' }).snapshot;
    const again = mergeAccount(other, account);
    expect(again.replaced).toEqual({ assets: 4, transactions: first.transactions.length });
    expect(again.snapshot.accounts.map((a) => a.name)).toEqual(['DEGIRO', 'Other broker']);
    expect(again.snapshot.transactions).toHaveLength(2 * first.transactions.length);
    const ids = again.snapshot.transactions.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The untouched account is identical.
    const otherId = other.accounts.find((a) => a.name === 'Other broker')!.id;
    const kept = (s: Snapshot) => {
      const assets = new Set(s.assets.filter((a) => a.accountId === otherId).map((a) => a.id));
      return s.transactions.filter((t) => assets.has(t.assetId));
    };
    expect(kept(again.snapshot)).toEqual(kept(other));
    expect(() => parseBackup(serializeBackup(again.snapshot))).not.toThrow();
  });

  it('keeps the categories of the base backup', () => {
    const base: Snapshot = { ...first, categories: [...first.categories, { ...first.categories[0], id: 99, name: 'Mine', isDefault: false }] };
    const merged = mergeAccount(base, account).snapshot;
    expect(merged.categories.map((c) => c.name)).toContain('Mine');
  });
});

describe('month-end prices', () => {
  const { account } = convertDegiro(CSV);
  const held = heldMonthEnds(account, '2026-10-28');

  it('asks for the month-ends while each investment is held, up to today', () => {
    const vici = held.get('US9256521090')!;
    expect(vici.get('2021-07')).toBe('2021-07-31');
    expect(vici.get('2024-02')).toBe('2024-02-29');
    expect(vici.get('2026-10')).toBe('2026-10-28');
    expect(vici.has('2021-06')).toBe(false);
    // Activision: bought Jan 2022, delisted Oct 2023 (sold that month).
    const activision = held.get('US00507V1098')!;
    expect([...activision.keys()][0]).toBe('2022-01');
    expect(activision.has('2023-09')).toBe(true);
    expect(activision.has('2023-10')).toBe(false);
    // Cash has no market price.
    expect(held.has('cash')).toBe(false);
  });

  it('saves them as online prices that set the value after the operations of the day', () => {
    const prices = [
      { asset: 'US9256521090', date: '2021-07-16', price: 27 },
      { asset: 'US9256521090', date: '2026-10-28', price: 28.5 },
    ];
    const { snapshot } = mergeAccount(null, { ...account, prices });
    expect(snapshot.prices.map((p) => [p.date, p.price, p.source])).toEqual([
      ['2021-07-16', 27, 'online'],
      ['2026-10-28', 28.5, 'online'],
    ]);
    // Bought at 25.44 € that day, the close (saved later in the day) gives the value.
    expect(load(snapshot, 'VICI Properties Inc').value).toBeCloseTo(285, 2);
    expect(() => parseBackup(serializeBackup(snapshot))).not.toThrow();
  });
});
