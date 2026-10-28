import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Percent } from '@/components/ui';
import { formatDate, formatNumber } from '@/domain/format';
import { reviewQuote, samePrice, type QuoteCandidate } from '@/domain/quotes';
import type { QuoteState } from '@/quotes/fetchQuotes';
import { useToday } from '@/state/DataProvider';
import { radius, space, useTheme } from '@/theme';

const unitPrice = (price: number) => `${formatNumber(price, price < 1 ? 6 : 4)} €`;

const sourceAmount = (price: number, currency: string) => `${formatNumber(price, 4)} ${currency}`;

/** Online prices: one investment's fetch status, old → new price and its save checkbox. */
export function QuoteRow({
  candidate: c,
  state,
  excluded,
  onToggle,
  first,
  last,
}: {
  candidate: QuoteCandidate;
  state: QuoteState;
  excluded: boolean;
  onToggle: () => void;
  first: boolean;
  last: boolean;
}) {
  const theme = useTheme();
  const now = useToday();
  const isFound = state.status === 'found';
  const review = isFound ? reviewQuote(c.previousPrice, state.price) : null;
  const unchanged = isFound && samePrice(c.previousPrice, state.price);
  // Grayed while waiting, or when the price didn't change and is left out.
  const muted = state.status === 'pending' || state.status === 'recent' || (unchanged && excluded);
  const [tipOpen, setTipOpen] = useState(false);
  const used = isFound && state.symbol.toUpperCase() !== c.query.toUpperCase() ? ` → ${state.symbol}` : '';

  return (
    <Pressable
      onPress={isFound ? onToggle : undefined}
      disabled={!isFound}
      accessibilityRole={isFound ? 'checkbox' : undefined}
      accessibilityState={isFound ? { checked: !excluded } : undefined}
      accessibilityLabel={isFound ? `Save the new price of ${c.name}` : undefined}
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }, first && styles.firstRow, last && styles.lastRow]}>
      <View style={styles.icon}>
        {state.status === 'fetching' ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : state.status === 'found' ? (
          <Ionicons name="checkmark-circle" size={22} color={theme.positive} />
        ) : state.status === 'recent' ? (
          <Ionicons name="time-outline" size={22} color={theme.textMuted} />
        ) : state.status === 'failed' ? (
          <Ionicons name="alert-circle" size={22} color={theme.negative} />
        ) : (
          <Ionicons name="ellipse-outline" size={22} color={theme.textMuted} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: muted ? theme.textMuted : theme.text, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
          {c.name}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>
          {c.identifier}
          {used}
        </Text>

        {state.status === 'recent' && (
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
            {c.previousPrice !== null ? `${unitPrice(c.previousPrice)} · ` : ''}fetched{' '}
            {state.minutesAgo < 1 ? 'just now' : `${state.minutesAgo} min ago`}: up to date
          </Text>
        )}

        {state.status === 'found' && (
          <>
            <View style={styles.priceLine}>
              {c.previousPrice !== null && (
                <Text style={{ color: theme.textMuted, textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] }}>
                  {unitPrice(c.previousPrice)}
                </Text>
              )}
              <Text style={{ color: muted ? theme.textMuted : theme.text, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                {c.previousPrice !== null ? '→ ' : ''}
                {unitPrice(state.price)}
              </Text>
              {unchanged ? (
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Unchanged</Text>
              ) : (
                review?.change != null && <Percent ratio={review.change} style={{ fontSize: 12 }} />
              )}
            </View>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              {state.sourceCurrency !== 'EUR' ? `${sourceAmount(state.sourcePrice, state.sourceCurrency)} → ${unitPrice(state.price)} · ` : ''}
              {state.date < now ? `market close ${formatDate(state.date)}` : 'live price'}
              {state.minutesAgo !== undefined ? ` · fetched ${state.minutesAgo < 1 ? 'just now' : `${state.minutesAgo} min ago`}` : ''}
            </Text>
            {review?.suspicious && (
              <>
                <Pressable
                  onPress={() => setTipOpen((o) => !o)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Big price change: what does it mean?"
                  style={[styles.badge, { borderColor: theme.staleSerious }]}>
                  <Ionicons name="warning-outline" size={12} color={theme.staleSerious} />
                  <Text style={{ color: theme.staleSerious, fontSize: 11, fontWeight: '600' }}>Big price change</Text>
                  <Ionicons name={tipOpen ? 'chevron-up' : 'information-circle-outline'} size={12} color={theme.staleSerious} />
                </Pressable>
                {tipOpen && (
                  <View style={[styles.tooltip, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                    <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                      More than 30% away from your last price
                      {c.previousDate ? ` (${formatDate(c.previousDate)})` : ''}. Normal if that price is old; otherwise check
                      the identifier is the right stock and exchange. It is still saved unless you untick it.
                    </Text>
                  </View>
                )}
              </>
            )}
            {excluded && (
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                {unchanged ? 'Same as your current price: nothing to save.' : 'Not saved: the current price is kept.'}
              </Text>
            )}
          </>
        )}
        {state.status === 'failed' && <Text style={{ color: theme.negative, fontSize: 12 }}>{state.error}</Text>}
      </View>
      {isFound && (
        <View style={styles.checkbox}>
          <Ionicons
            name={excluded ? 'square-outline' : 'checkbox'}
            size={24}
            color={excluded ? theme.textMuted : theme.primary}
          />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  firstRow: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  lastRow: { borderBottomWidth: 0, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  icon: { width: 24, alignItems: 'center', paddingTop: 1 },
  priceLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space.sm, marginTop: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  tooltip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, padding: space.sm, marginTop: 4 },
  checkbox: { justifyContent: 'center', paddingLeft: space.xs },
});
