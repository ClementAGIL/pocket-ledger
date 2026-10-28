import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';

import { formatDate, formatNumber } from '@/domain/format';
import { compareEntries, isCharge, timeOfPrice, timeOfTransaction } from '@/domain/positions';
import type { PricePoint, Transaction } from '@/domain/types';
import { useMoney } from '@/hooks/useMoney';
import { space, useTheme } from '@/theme';

const TX_LABELS: Record<Transaction['type'], string> = {
  BUY: 'Buy',
  SELL: 'Sell',
  DEPOSIT: 'Deposit',
  WITHDRAW: 'Withdraw',
  INCOME: 'Income',
};

const LIABILITY_TX_LABELS: Partial<Record<Transaction['type'], string>> = { DEPOSIT: 'Borrow', WITHDRAW: 'Repay' };

/** "Buy", "Deposit"… ("Borrow" / "Repay" on a loan). */
export const txLabel = (type: Transaction['type'], isLiability: boolean) =>
  (isLiability && LIABILITY_TX_LABELS[type]) || TX_LABELS[type];

export type Entry = { kind: 'tx'; date: string; tx: Transaction } | { kind: 'price'; date: string; price: PricePoint };

/** Newest first: the exact reverse of the calculation order (date, then time saved). */
const key = (e: Entry) =>
  e.kind === 'tx'
    ? { date: e.date, at: timeOfTransaction(e.tx), order: 0 as const, id: e.tx.id }
    : { date: e.date, at: timeOfPrice(e.price), order: 1 as const, id: e.price.id };

export const newestFirst = (a: Entry, b: Entry) => compareEntries(key(b), key(a));

/** One line of an investment's history: an operation or a price update. */
export function EntryLine({
  entry,
  isLiability,
  units,
  link,
  account,
}: {
  entry: Entry;
  isLiability: boolean;
  units: boolean;
  /** Other side of a cash transfer ("Paid from Livret A"). */
  link: string | null;
  /** The account it belongs to, on a holding page (one product in several accounts). */
  account?: string;
}) {
  const theme = useTheme();
  const { money } = useMoney();
  let title: string;
  let detail: string;
  if (entry.kind === 'price') {
    title = units ? 'Price update' : isLiability ? 'Balance update' : 'Value update';
    detail = money(entry.price.price);
  } else {
    const t = entry.tx;
    title = isCharge(t) ? 'Fee' : txLabel(t.type, isLiability);
    detail =
      t.quantity !== null
        ? `${formatNumber(t.quantity)} × ${money(t.unitPrice ?? 0)}${t.fees ? ` + ${money(t.fees)} fees` : ''}`
        : isCharge(t)
          ? `−${money(t.fees - t.amount)}`
          : `${money(t.amount)}${t.fees ? ` − ${money(t.fees)} fees` : ''}`;
  }
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: theme.text, fontWeight: '500', flexShrink: 1 }} numberOfLines={1}>
          {title}
          {account ? <Text style={{ color: theme.textMuted, fontWeight: '400' }}> · {account}</Text> : null}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>{formatDate(entry.date)}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{detail}</Text>
        {entry.kind === 'price' && <PriceSourceTag source={entry.price.source} />}
      </View>
      {entry.kind === 'tx' && entry.tx.note ? <Text style={{ color: theme.textMuted, fontSize: 12 }}>{entry.tx.note}</Text> : null}
      {link && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="swap-horizontal-outline" size={12} color={theme.primary} />
          <Text style={{ color: theme.primary, fontSize: 12 }}>{link}</Text>
        </View>
      )}
    </View>
  );
}

/** How a price got there: typed by hand, or fetched with Online prices. */
function PriceSourceTag({ source }: { source: PricePoint['source'] }) {
  const theme = useTheme();
  const online = source === 'online';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name={online ? 'sync-outline' : 'create-outline'} size={12} color={online ? theme.primary : theme.textMuted} />
      <Text style={{ color: online ? theme.primary : theme.textMuted, fontSize: 12 }}>{online ? 'Fetched online' : 'Entered manually'}</Text>
    </View>
  );
}
