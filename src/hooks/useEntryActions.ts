import { router } from 'expo-router';

import { txLabel, type Entry } from '@/components/asset/EntryLine';
import * as repo from '@/db/repo';
import { formatDate } from '@/domain/format';
import type { Transaction } from '@/domain/types';
import { useData } from '@/state/DataProvider';
import { useUndo } from '@/state/UndoProvider';

/** What a history line does (investment and holding pages): open it, delete it with an undo, its cash link. */
export function useEntryActions() {
  const { portfolio, write } = useData();
  const showUndo = useUndo();

  /** "Paid from Livret A" / "Linked to MSCI World" for the two sides of a cash transfer. */
  const linkLabel = (tx: Transaction) => {
    const other = tx.linkedId != null ? portfolio.txById.get(tx.linkedId) : undefined;
    const name = other && portfolio.byAssetId.get(other.assetId)?.asset.name;
    if (!other || !name) return null;
    if (tx.type === 'BUY') return `Paid from ${name}`;
    if (tx.type === 'SELL' || tx.type === 'INCOME') return `Paid into ${name}`;
    return `Linked to ${name}`;
  };

  const openEntry = (entry: Entry) =>
    router.push({
      pathname: '/operation',
      params: entry.kind === 'tx' ? { txId: String(entry.tx.id) } : { priceId: String(entry.price.id) },
    });

  // An entry is deleted right away: the "Undo" banner replaces a confirmation.
  const deleteEntry = async (entry: Entry) => {
    if (entry.kind === 'tx') {
      const { tx } = entry;
      // A cash transfer goes as a pair: the buy and the withdrawal that paid it.
      const linked = tx.linkedId != null ? portfolio.txById.get(tx.linkedId) : undefined;
      const pair = linked ? [tx, linked] : [tx];
      await write(async (txn) => {
        for (const t of pair) await repo.deleteTransaction(txn, t.id);
      });
      const label = txLabel(tx.type, portfolio.byAssetId.get(tx.assetId)?.isLiability ?? false);
      const otherName = linked && portfolio.byAssetId.get(linked.assetId)?.asset.name;
      showUndo(`${label} of ${formatDate(tx.date)}${otherName ? ` and its ${otherName} entry` : ''} deleted`, () =>
        write(async (txn) => {
          for (const t of pair) await repo.restoreTransaction(txn, t);
        }),
      );
    } else {
      const { price } = entry;
      await write((txn) => repo.deletePrice(txn, price.id));
      showUndo(`Update of ${formatDate(price.date)} deleted`, () => write((txn) => repo.restorePrice(txn, price)));
    }
  };

  return { linkLabel, openEntry, deleteEntry };
}
