import { parseBackup, serializeBackup } from '@/backup/format';
import { computePosition } from '@/domain/positions';
import type { Snapshot } from '@/domain/types';

import { applySplits, historyMatchesTrades, mergeAccount } from '../ledger';
import { convertRevolut, parseMoney, parseRevolutDate } from '../revolut';

// Same layout as a real Revolut consolidated statement, invented amounts. Revolut encodes the text
// twice ("RelevÃ©s", "â‚¬") and drops the decimal point of crypto quantities ("150,000,000" = 1,5).
const CSV = `RelevÃ© consolidÃ©
---------
Comptes courants RelevÃ©s de transactions
Compte personnel (EUR)
Date,Description,CatÃ©gorie,Argent entrant/sortant,Solde,ImpÃ´t retenu,Autres taxes,Frais
26 avr. 2020,Recharge via *1234,Virements,"1â€¯000,00â‚¬","1â€¯000,00â‚¬","0,00â‚¬","0,00â‚¬","0,00â‚¬"
29 aoÃ»t 2020,Change en USD,Change,"-500,00â‚¬","500,00â‚¬","0,00â‚¬","0,00â‚¬","0,00â‚¬"
2 dÃ©c. 2020,To JANE DOE,Virements,"-100,00â‚¬","400,00â‚¬","0,00â‚¬","0,00â‚¬","0,00â‚¬"
8 juil. 2021,Change en USD,Change,"-200,00â‚¬","200,00â‚¬","0,00â‚¬","0,00â‚¬","0,00â‚¬"
Total,,,,"200,00â‚¬",,,
Compte personnel (USD)
Date,Description,CatÃ©gorie,Argent entrant/sortant,,Solde,,ImpÃ´t retenu,,Autres taxes,,Frais,
29 aoÃ»t 2020,Change en USD,Change,"590,00$","500,00â‚¬","590,00$","500,00â‚¬",,,,,,
30 aoÃ»t 2020,To USD Investment pocket,Virements,"-590,00$","-500,00â‚¬","0,00$","0,00â‚¬",,,,,,
3 sept. 2020,Cafe Paris,Restaurants,"-5,00$","-4,20â‚¬","-5,00$","-4,20â‚¬",,,,,,
---------
Investment Services RelevÃ©s de transactions
Dividendes
Date,Description et symbole,ISIN,Pays,Gross USD,Gross EUR,Tax USD,Tax EUR,Other USD,EUR,Frais,Frais,Net USD,Net EUR
22 Oct. 2020,Cisco dividend,US17275R1023,US,"1,18$","1,00â‚¬","0,18$","0,15â‚¬","0,00$","0,00â‚¬","0,00$","0,00â‚¬","1,00$","0,85â‚¬"
Total,,,,,,,,,,,,,
UnitÃ©s vendues
"Date (de la vente)",Description et symbole,ISIN,QuantitÃ©,Pays,Prix
Autres transactions de compte de courtier
Date,Description et symbole,ISIN,QuantitÃ©,Pays,Valeur brute USD,Valeur brute EUR,ImpÃ´ts USD,ImpÃ´ts EUR,Autres taxes USD,Autres taxes EUR,Frais USD,Frais EUR,Valeur nette USD,Valeur nette EUR
2 sept. 2020,CSCO,US17275R1023,10.5,US,US$501.18,â‚¬425.00,US$0.00,â‚¬0.00,US$0.00,â‚¬0.00,US$1.18,â‚¬1.00,US$500.00,â‚¬424.00
9 juil. 2021,MSFT,US5949181045,0.8,US,US$237.00,â‚¬200.00,US$0.00,â‚¬0.00,US$0.00,â‚¬0.00,US$0.00,â‚¬0.00,US$237.00,â‚¬200.00
Total,,,,,,,,,,,,,,
---------
Cryptos RelevÃ©s de transactions
Cryptos reÃ§ues via Apprendre et gagner
Date du reÃ§u,Description et symbole,UnitÃ©s reÃ§ues,Prix unitaire,Valeur reÃ§ue,Frais
16.07.22,XYZ,"150,000,000","0,40â‚¬","0,60â‚¬","0,00â‚¬"
03.03.23,XYZ,"5,214,123","1,00â‚¬","0,52â‚¬","0,00â‚¬"
04.03.23,BONK,"9â€¯764,4114","0,00â‚¬","0,10â‚¬","0,00â‚¬"
Total,,,,"1,22â‚¬",
Cryptos reÃ§us via le staking
Date du reÃ§u,Description et symbole,UnitÃ©s reÃ§ues,Prix unitaire,Valeur reÃ§ue,Frais
01.12.23,XYZ,"1,000,000","0,40â‚¬","0,00â‚¬","0,00â‚¬"
15.12.23,XYZ,"1,000,000","0,40â‚¬","0,00â‚¬","0,00â‚¬"
01.03.24,XYZ,"1,000,000","0,40â‚¬","0,00â‚¬","0,00â‚¬"
Total,,,,"0,00â‚¬",
Avoirs Ã  la fin de la pÃ©riode
Description et symbole,UnitÃ©s dÃ©tenues,Prix unitaire,Valeur dÃ©tenue
XYZ,"20,614,123","0,40â‚¬","0,82â‚¬"
BONK,"9â€¯764,4114","0,00â‚¬","0,20â‚¬"
Total,,,"1,02â‚¬"
`;

const position = (snapshot: Snapshot, name: string) => {
  const asset = snapshot.assets.find((a) => a.name === name)!;
  return computePosition(
    asset.valuation,
    snapshot.transactions.filter((t) => t.assetId === asset.id),
    snapshot.prices.filter((p) => p.assetId === asset.id),
  );
};

describe('Revolut consolidated statement', () => {
  const { account, warnings } = convertRevolut(CSV);
  const { snapshot } = mergeAccount(null, account);

  it('reads French dates, double-encoded or not, and the crypto dates', () => {
    expect(parseRevolutDate('29 aoÃ»t 2020')).toBe('2020-08-29');
    expect(parseRevolutDate('2 déc. 2020')).toBe('2020-12-02');
    expect(parseRevolutDate('8 juil. 2021')).toBe('2021-07-08');
    expect(parseRevolutDate('3 juin 2021')).toBe('2021-06-03');
    expect(parseRevolutDate('23 Oct. 2020')).toBe('2020-10-23');
    expect(parseRevolutDate('16.07.22')).toBe('2022-07-16');
    expect(parseRevolutDate('Total')).toBeNull();
  });

  it('reads both number styles', () => {
    expect(parseMoney('"1â€¯990,00â‚¬"')).toBe(1990);
    expect(parseMoney('-810,00€')).toBe(-810);
    expect(parseMoney('US$1,234.56')).toBe(1234.56);
    expect(parseMoney('â‚¬430.18')).toBe(430.18);
    expect(parseMoney('—')).toBeNull();
  });

  it('counts the euros changed into dollars as the money put in, nothing else from the current accounts', () => {
    const cash = account.operations.filter((o) => o.asset === 'cash');
    expect(cash.map((o) => [o.date, o.type, o.amount])).toEqual([
      ['2020-08-29', 'DEPOSIT', 500],
      ['2021-07-08', 'DEPOSIT', 200],
    ]);
    expect(warnings.some((w) => w.includes('Cafe Paris'))).toBe(true);
  });

  it('books the buys (net + fees, paid from the cash) and the net dividends', () => {
    const cisco = position(snapshot, 'Cisco');
    expect(cisco.quantity).toBeCloseTo(10.5);
    expect(cisco.invested).toBeCloseTo(425);
    expect(cisco.income).toBeCloseTo(0.85);
    expect(snapshot.assets.find((a) => a.name === 'MSFT')?.identifier).toBe('US5949181045');
    // 500 + 200 in, 425 + 200 out, 0,85 of dividend.
    expect(position(snapshot, 'Revolut cash').value).toBeCloseTo(75.85);
    expect(warnings.some((w) => w.includes('75.85 €') && w.includes('Update balance'))).toBe(true);
  });

  it('rebuilds the crypto quantities and adds up to the holdings', () => {
    const xyz = position(snapshot, 'XYZ');
    expect(xyz.quantity).toBeCloseTo(2.0614123, 9);
    // Received for free: a gain, not money put in.
    expect(xyz.invested).toBe(0);
    expect(position(snapshot, 'BONK').quantity).toBeCloseTo(9764.4114, 6);
    expect(snapshot.assets.find((a) => a.name === 'XYZ')?.identifier).toBe('XYZ');
  });

  it('sums the staking into one entry per coin and year, and Learn & Earn per day', () => {
    const notes = account.operations.filter((o) => o.asset === 'crypto:XYZ').map((o) => [o.date, o.quantity, o.note]);
    expect(notes).toEqual([
      ['2022-07-16', 1.5, 'Revolut Learn & Earn: worth 0.60 € when received'],
      ['2023-03-03', 0.5214123, 'Revolut Learn & Earn: worth 0.52 € when received'],
      // The holding is 0,01 above the lines: the staking (where values can't tell) is scaled up.
      ['2023-12-15', expect.closeTo(0.02666667, 7), 'Revolut staking 2023: 2 rewards, worth 0.01 € when received'],
      ['2024-03-01', expect.closeTo(0.01333333, 7), 'Revolut staking 2024: 1 reward, worth 0.01 € when received'],
    ]);
  });

  it('writes a backup the app can restore', () => {
    expect(() => parseBackup(serializeBackup(snapshot))).not.toThrow();
  });

  it('rejects something that is not a Revolut statement', () => {
    expect(() => convertRevolut('Date,Heure\n01-01-2024,10:00\n')).toThrow(/Revolut/);
  });
});

describe('historyMatchesTrades', () => {
  const account = {
    name: 'A',
    institution: null,
    assets: [],
    operations: [
      { asset: 'x', type: 'BUY' as const, date: '2024-01-10', time: '12:00', quantity: 1, unitPrice: 6.5, amount: 0, fees: 0, note: null },
      { asset: 'x', type: 'BUY' as const, date: '2024-06-10', time: '12:00', quantity: 1, unitPrice: 5, amount: 0, fees: 0, note: null },
    ],
  };

  it('accepts a history near the trade prices', () => {
    expect(historyMatchesTrades(account, 'x', new Map([['2024-01', 7], ['2024-06', 5.2]]))).toBe(true);
  });

  it('rejects another product with the same symbol', () => {
    expect(historyMatchesTrades(account, 'x', new Map([['2024-01', 0.02], ['2024-06', 0.019]]))).toBe(false);
  });

  it('accepts when there is nothing to compare', () => {
    expect(historyMatchesTrades(account, 'x', new Map([['2023-01', 0.02]]))).toBe(true);
  });
});

describe('applySplits', () => {
  it('restates the operations before a split in new shares (same money)', () => {
    const { account } = convertRevolut(CSV);
    const applied = applySplits(account, 'US5949181045', [
      { date: '2021-01-01', ratio: 4 },
      { date: '2022-07-18', ratio: 20 },
    ]);
    // Bought in July 2021: only the later split counts.
    expect(applied).toEqual([{ date: '2022-07-18', ratio: 20 }]);
    const buy = account.operations.find((o) => o.asset === 'US5949181045')!;
    expect(buy.quantity).toBeCloseTo(16);
    expect(buy.unitPrice! * buy.quantity!).toBeCloseTo(200);
    expect(buy.amount).toBe(200);
    expect(buy.note).toContain('before the 2022-07-18 split: ×20');
  });
});
