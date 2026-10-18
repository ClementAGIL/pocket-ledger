import { StyleSheet, Text, View } from 'react-native';

import { formatDate, formatNumber } from '@/domain/format';
import type { Position } from '@/domain/positions';
import type { PlannedRepayment } from '@/domain/repayments';
import type { Valuation } from '@/domain/types';
import { useMoney } from '@/hooks/useMoney';
import { useData } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

import { Card, Money, Percent, Row } from '../ui';

/** Where the investment stands before the operation. */
export function CurrentPosition({ assetId }: { assetId: number }) {
  const theme = useTheme();
  const { portfolio } = useData();
  const { money } = useMoney();
  const view = portfolio.byAssetId.get(assetId);
  if (!view) return null;
  const { position: p, asset, isLiability } = view;
  const units = asset.valuation === 'units';
  return (
    <Card style={{ marginTop: space.md, paddingVertical: space.sm }}>
      <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>Current position</Text>
      {units && (
        <>
          <Row label="Quantity">{formatNumber(p.quantity)}</Row>
          <Row label="Last price">
            {p.price !== null ? `${money(p.price)}${p.priceDate ? ` · ${formatDate(p.priceDate)}` : ''}` : '—'}
          </Row>
          {p.avgCost !== null && <Row label="Average cost">{money(p.avgCost)}</Row>}
        </>
      )}
      <Row label={isLiability ? 'Remaining balance' : 'Value'}>
        <Money value={p.value} />
      </Row>
      {!units && p.priceDate && <Row label="Last update">{formatDate(p.priceDate)}</Row>}
      {!isLiability && (
        <Row label="Unrealized gain">
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Money value={p.unrealized} signed colored />
            <Percent ratio={p.unrealizedPct} />
          </View>
        </Row>
      )}
    </Card>
  );
}

/** Before → after for everything the operation changes; unchanged details are left out. */
export function ImpactPreview({
  before,
  after,
  valuation,
  isLiability,
  cash,
}: {
  before: Position | null;
  after: Position;
  valuation: Valuation;
  isLiability: boolean;
  cash: { label: string; value: number } | null;
}) {
  const { money } = useMoney();
  const euro = (v: number) => money(v);
  const signed = (v: number) => money(v, { signed: true });
  const units = valuation === 'units';
  return (
    <Card>
      {cash && <Row label={cash.label}>{money(cash.value)}</Row>}
      {units && (
        <>
          <PreviewRow optional label="Quantity" before={before?.quantity} after={after.quantity} format={(v) => formatNumber(v)} />
          <PreviewRow optional label="Last price" before={before?.price} after={after.price} format={euro} />
          <PreviewRow optional label="Average cost" before={before?.avgCost} after={after.avgCost} format={euro} />
        </>
      )}
      <PreviewRow label={isLiability ? 'Debt' : 'Value'} before={before?.value} after={after.value} format={euro} />
      {!isLiability && (
        <>
          <PreviewRow optional label="Invested" before={before?.invested} after={after.invested} format={euro} />
          <PreviewRow label="Unrealized gain" before={before?.unrealized} after={after.unrealized} format={signed} />
          <PreviewRow optional label="Realized gain" before={before?.realized} after={after.realized} format={signed} />
          <PreviewRow optional label={units ? 'Dividends' : 'Interest'} before={before?.income} after={after.income} format={euro} />
        </>
      )}
    </Card>
  );
}

/** The repayments that will be created, before saving. */
export function RepayPlanPreview({ plan }: { plan: PlannedRepayment[] }) {
  const theme = useTheme();
  const { money } = useMoney();
  const total = plan.reduce((s, r) => s + r.amount, 0);
  const shown = plan.length > 8 ? [...plan.slice(0, 3), null, ...plan.slice(-2)] : plan;
  return (
    <Card style={{ marginTop: space.lg, gap: space.xs }}>
      <Text style={{ color: theme.text, fontWeight: '600', fontSize: 15 }}>
        {plan.length > 1
          ? `${plan.length} repayments of ${money(plan[0].amount)} (principal)`
          : `1 repayment of ${money(plan[0].amount)} (principal)`}
      </Text>
      {shown.map((r, i) =>
        r ? (
          <Row key={r.date} label={formatDate(r.date)}>
            {money(r.amount)}
          </Row>
        ) : (
          <Text key={`gap-${i}`} style={{ color: theme.textMuted }}>
            …
          </Text>
        ),
      )}
      {plan.length > 1 && <Row label="Total repaid">{money(total)}</Row>}
    </Card>
  );
}

function PreviewRow({
  label,
  before,
  after,
  format,
  optional,
}: {
  label: string;
  before: number | null | undefined;
  after: number | null;
  format: (v: number) => string;
  /** Hide the row when the value doesn't change (or is empty for a new investment). */
  optional?: boolean;
}) {
  const theme = useTheme();
  const changed = before == null || after == null || Math.abs(before - after) > 1e-9;
  if (optional && (after == null || (before == null ? Math.abs(after) < 1e-9 : !changed))) return null;
  return (
    <Row label={label}>
      <Text style={{ color: theme.text, fontVariant: ['tabular-nums'] }}>
        {before != null && changed && <Text style={{ color: theme.textMuted }}>{format(before)} → </Text>}
        <Text style={{ fontWeight: changed ? '600' : '400' }}>{after == null ? '—' : format(after)}</Text>
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.xs },
});
