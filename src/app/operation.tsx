import { router, Stack, useLocalSearchParams } from 'expo-router';

import { OperationForm } from '@/components/operation/OperationForm';
import { useData } from '@/state/DataProvider';
import type { Transaction } from '@/domain/types';

/** Buy, sale or dividend: the side the user entered; the cash side follows it. */
const isMainSide = (t: Transaction) => t.type === 'BUY' || t.type === 'SELL' || t.type === 'INCOME';

/**
 * Modal used from an asset page: `?assetId=` to add an operation to that asset,
 * `?txId=` / `?priceId=` to edit an existing entry.
 */
export default function OperationScreen() {
  const params = useLocalSearchParams<{ assetId?: string; txId?: string; priceId?: string }>();
  const { snapshot, portfolio } = useData();
  const tapped = params.txId ? portfolio.txById.get(Number(params.txId)) : undefined;
  // The cash side of a transfer (Livret A withdrawal for a buy) is edited through the buy itself.
  const linked = tapped?.linkedId != null ? portfolio.txById.get(tapped.linkedId) : undefined;
  const editTransaction = linked && isMainSide(linked) && !isMainSide(tapped!) ? linked : tapped;
  const editPrice = params.priceId ? snapshot.prices.find((p) => p.id === Number(params.priceId)) : undefined;
  const isEdit = !!(editTransaction || editPrice);

  return (
    <>
      <Stack.Screen options={{ title: isEdit ? 'Edit operation' : 'New operation' }} />
      <OperationForm
        assetId={params.assetId ? Number(params.assetId) : undefined}
        editTransaction={editTransaction}
        editPrice={editPrice}
        onSaved={() => router.back()}
      />
    </>
  );
}
