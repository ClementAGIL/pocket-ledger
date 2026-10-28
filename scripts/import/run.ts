/*
 * Builds a Pocket Ledger backup from broker/bank statements, to load with Settings › Backup ›
 * "Restore from a file". Runs on the computer.
 *
 *   npm run import -- <format> <statement.csv> [--out <backup.json>] [--account <name>] [--no-prices]
 *
 * Month-end prices: for every investment with an identifier, the script asks Yahoo Finance for its
 * whole monthly history (only the ISIN / symbol is sent: no dates, quantities or amounts) and adds
 * the close of each month it was held, so the chart follows the market between operations.
 * --no-prices skips it: nothing is sent anywhere.
 *
 * The output file is merged, never overwritten: if it exists (a previous run, or a backup exported
 * from the app without a password), only the imported account is replaced; every other account,
 * investment and entry is kept. Run it once per statement, in any order, on the same --out.
 */
import { parseBackup, serializeBackup } from '@/backup/format';
import { today } from '@/domain/dates';
import { computePosition } from '@/domain/positions';
import { quoteErrorMessage } from '@/domain/quotes';
import type { Snapshot } from '@/domain/types';
import { fetchMonthlyHistory } from '@/quotes/fetchQuotes';

import { convertDegiro, type ConvertResult } from './degiro';
import { convertRevolut } from './revolut';
import { applySplits, heldMonthEnds, historyMatchesTrades, mergeAccount, type ImportedAccount, type ImportedPrice } from './ledger';

// Node APIs, typed here: the app's tsconfig leaves Node's types out so they don't leak into app code.
/* eslint-disable @typescript-eslint/no-require-imports */
const { existsSync, readFileSync, writeFileSync }: {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string): void;
} = require('node:fs');
const { resolve }: { resolve(...paths: string[]): string } = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */
const process: { argv: string[]; exit(code: number): never } = (globalThis as unknown as { process: never }).process;

/** One converter per statement format. Add a new bank here (and its file next to degiro.ts). */
/** `missingSplits`: the statement keeps pre-split quantities, so Yahoo's splits are applied (needs the prices). */
const CONVERTERS: Record<
  string,
  { label: string; account: string; convert: (text: string, account: string) => ConvertResult; missingSplits?: boolean }
> = {
  degiro: { label: 'DEGIRO account statement (CSV, French)', account: 'DEGIRO', convert: convertDegiro },
  revolut: { label: 'Revolut consolidated statement (CSV, French)', account: 'Revolut', convert: convertRevolut, missingSplits: true },
};

const DEFAULT_OUT = 'pocket-ledger-import.json';

function usage(message?: string): never {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: npm run import -- <format> <statement.csv> [--out <backup.json>] [--account <name>]\n');
  console.error('Formats:');
  for (const [key, c] of Object.entries(CONVERTERS)) console.error(`  ${key.padEnd(10)} ${c.label} (account "${c.account}")`);
  console.error(`\n--out defaults to ${DEFAULT_OUT}. An existing file is merged: only the imported account is replaced.`);
  process.exit(1);
}

async function main(args: string[]) {
  const positional: string[] = [];
  const options: Record<string, string> = {};
  let withPrices = true;
  for (let i = 0; i < args.length; i++) {
    const m = /^--(out|account)$/.exec(args[i]);
    if (args[i] === '--no-prices') withPrices = false;
    else if (m) {
      if (!args[i + 1]) usage(`${args[i]} needs a value`);
      options[m[1]] = args[++i];
    } else if (args[i].startsWith('--')) usage(`unknown option ${args[i]}`);
    else positional.push(args[i]);
  }
  const [format, input] = positional;
  if (!format || !input || positional.length > 2) usage();
  const converter = CONVERTERS[format.toLowerCase()];
  if (!converter) usage(`unknown format "${format}"`);
  if (!existsSync(input)) usage(`file not found: ${input}`);

  const out = resolve(options.out ?? DEFAULT_OUT);
  let base: Snapshot | null = null;
  if (existsSync(out)) {
    try {
      base = parseBackup(readFileSync(out, 'utf8'));
    } catch (e) {
      // Never overwrite a file we can't read: it could hold data (or be a password-protected export).
      usage(`${out} exists but isn't a readable Pocket Ledger backup (${(e as Error).message}). Export it without a password, or choose another --out.`);
    }
  }

  const accountName = options.account ?? converter.account;
  const { account, warnings } = converter.convert(readFileSync(input, 'utf8'), accountName);
  if (withPrices) account.prices = await monthEndPrices(account, warnings, !!converter.missingSplits);
  else if (converter.missingSplits) warnings.push('This statement leaves stock splits out and --no-prices skipped them: check the quantities of split stocks.');
  const { snapshot, replaced } = mergeAccount(base, account);
  // Same check as the app's restore: the file we write must load.
  parseBackup(serializeBackup(snapshot));
  writeFileSync(out, serializeBackup(snapshot));

  printSummary(snapshot, accountName);
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s), check them:`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
  console.log(
    `\n${base ? 'Merged into' : 'Created'} ${out}` +
      (replaced ? ` (replaced the previous "${accountName}": ${replaced.assets} investments, ${replaced.transactions} entries)` : '') +
      `.\nOther accounts in the file: ${snapshot.accounts.filter((a) => a.name !== accountName).map((a) => a.name).join(', ') || 'none'}.`,
  );
  console.log('Copy it to the phone, then Settings › Backup › Restore from a file (it replaces the data in the app).');
  console.log(
    withPrices
      ? 'Prices: month-end closes from Yahoo Finance (the euro listing when there is one), up to today.'
      : 'Prices are the last trade prices: use "Fetch prices online" (ISINs are set) or Update prices afterwards.',
  );
}

/** Month-end closes of each investment while it was held. Sends only the identifiers. */
async function monthEndPrices(account: ImportedAccount, warnings: string[], missingSplits: boolean): Promise<ImportedPrice[]> {
  const held = heldMonthEnds(account, today());
  const prices: ImportedPrice[] = [];
  console.log(`Fetching month-end prices for ${held.size} investment(s) from Yahoo Finance (only the identifiers are sent)…`);
  for (const [key, months] of held) {
    const asset = account.assets.find((a) => a.key === key)!;
    // Yahoo lists coins as "BTC-EUR" (the app asks CoinGecko, which has no free monthly history).
    const identifier = /crypto/i.test(asset.category) ? `${asset.identifier!.toUpperCase()}-EUR` : asset.identifier!;
    try {
      const history = await fetchMonthlyHistory(identifier, { from: [...months.keys()][0] });
      if (missingSplits) {
        for (const split of applySplits(account, key, history.splits)) {
          console.log(`  ${asset.name}: ${split.date} split ×${split.ratio} applied to the earlier operations`);
          warnings.push(`${asset.name}: ${split.date} split (×${split.ratio}) isn't in the statement: applied from Yahoo.`);
        }
      }
      if (!historyMatchesTrades(account, key, history.months)) {
        console.log(`  ${asset.name}: ${history.symbol} doesn't match the statement's prices, ignored`);
        warnings.push(`${asset.name}: ${history.symbol} on Yahoo is far from the statement's prices (another product?): no month-end prices.`);
        continue;
      }
      let found = 0;
      for (const [month, date] of months) {
        const price = history.months.get(month);
        if (price === undefined) continue;
        prices.push({ asset: key, date, price: Math.round(price * 1e4) / 1e4 });
        found++;
      }
      console.log(`  ${asset.name}: ${history.symbol} (${history.currency}), ${found}/${months.size} months`);
      if (found < months.size) warnings.push(`${asset.name}: no market price for ${months.size - found} of ${months.size} months (${history.symbol}).`);
    } catch (e) {
      console.log(`  ${asset.name}: not found`);
      warnings.push(`${asset.name} (${identifier}): no price history (${quoteErrorMessage(e)}). Its chart stays flat between operations.`);
    }
  }
  return prices;
}

function printSummary(snapshot: Snapshot, accountName: string) {
  const account = snapshot.accounts.find((a) => a.name === accountName)!;
  const eur = (n: number) => `${n.toFixed(2)} €`.padStart(12);
  console.log(`\n${accountName}`);
  console.log(`${'Investment'.padEnd(40)}${'Quantity'.padStart(10)}${'Invested'.padStart(12)}${'Income'.padStart(12)}${'Realized'.padStart(12)}`);
  for (const asset of snapshot.assets.filter((a) => a.accountId === account.id)) {
    const txs = snapshot.transactions.filter((t) => t.assetId === asset.id);
    const prices = snapshot.prices.filter((p) => p.assetId === asset.id);
    const p = computePosition(asset.valuation, txs, prices);
    const quantity = asset.valuation === 'units' ? String(+p.quantity.toFixed(6)) : '';
    const label = asset.valuation === 'balance' ? `${asset.name} (balance ${p.value.toFixed(2)} €)` : asset.name;
    console.log(`${label.slice(0, 39).padEnd(40)}${quantity.padStart(10)}${eur(p.invested)}${eur(p.income)}${eur(p.realized)}`);
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
