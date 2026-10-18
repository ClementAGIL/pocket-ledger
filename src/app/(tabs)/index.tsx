import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnnualizedReturn } from '@/components/AnnualizedReturn';
import { GainBreakdown } from '@/components/GainBreakdown';
import { GoalsCard } from '@/components/GoalsCard';
import { useOnlinePricesEntry } from '@/components/OnlinePricesIntro';
import { HistoryChart } from '@/components/HistoryChart';
import { IconButton, ReminderButton } from '@/components/home/HeaderButtons';
import { ReviewReminder, SetupReminder, UpdateReminder } from '@/components/home/Reminders';
import { PeriodSelector } from '@/components/PeriodSelector';
import { Button, Card, ModalCard, Money, Percent, Row, SectionTitle, Segmented } from '@/components/ui';
import { formatDate } from '@/domain/format';
import { benchmarkSeries } from '@/domain/benchmark';
import { buildHistory, downsample, sliceHistory, type HistoryPoint } from '@/domain/history';
import { PERIOD_LABELS } from '@/domain/performance';
import { missingSetup } from '@/domain/projection';
import { reviewsDue } from '@/domain/reviews';
import { summarizeStaleness } from '@/domain/staleness';
import { useData, useToday } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

export default function PortfolioScreen() {
  const theme = useTheme();
  const now = useToday();
  const { portfolio, performance, returns, settings, snapshot, updateSettings } = useData();
  const { summary } = portfolio;
  const perf = performance.total;
  const hidden = settings.hideAmounts;
  const periodLabel = PERIOD_LABELS[performance.period];

  const rate = settings.benchmarkRate;
  const rateLabel = `${+(rate * 100).toFixed(2)}%`;
  const history = useMemo((): (HistoryPoint & { benchmark?: number })[] => {
    const points = buildHistory(
      [...portfolio.byAssetId.values()].map((v) => ({ steps: v.steps, isLiability: v.isLiability })),
      now,
    );
    if (rate <= 0) return points;
    // "What if every euro had earned the rate": recomputed from the operations, never stored.
    const benchmark = benchmarkSeries(snapshot, points.map((p) => p.date), rate);
    return points.map((p, i) => ({ ...p, benchmark: benchmark[i] }));
  }, [portfolio, snapshot, rate, now]);
  const benchmarkToday = rate > 0 ? history[history.length - 1]?.benchmark : undefined;
  // The chart covers the selected period, starting from the value carried into it.
  const points = downsample(sliceHistory(history, performance.start));
  // With debts, the default view matches the headline (net worth); "Investments" compares assets
  // with the money invested, which debts would distort.
  const hasDebts = history.some((p) => p.liabilities > 0.005);
  const [chartView, setChartView] = useState<'networth' | 'investments'>('networth');
  const showNetWorth = hasDebts && chartView === 'networth';
  const chartPoints = showNetWorth ? points.map((p) => ({ date: p.date, value: p.value - p.liabilities })) : points;

  const isEmpty = portfolio.byAssetId.size === 0;
  const staleness = useMemo(() => summarizeStaleness(portfolio.byAssetId.values(), now), [portfolio, now]);
  const reviews = useMemo(() => reviewsDue(portfolio.byAssetId.values(), now), [portfolio, now]);
  // Fresh install or reset: offer to set a goal and an emergency fund, until done or dismissed.
  const setup = settings.setupReminderDismissed ? [] : missingSetup(settings.projection);
  const hasReminders = staleness.stale > 0 || reviews.length > 0 || setup.length > 0;
  const [reminderOpen, setReminderOpen] = useState(false);
  const online = useOnlinePricesEntry();
  const closeAnd = (path: Parameters<typeof router.push>[0]) => {
    setReminderOpen(false);
    router.push(path);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Text style={[styles.appName, { color: theme.text }]} numberOfLines={1}>
            Pocket Ledger
          </Text>
          <View style={styles.actions}>
            {hasReminders && (
              <ReminderButton summary={staleness} reviews={reviews.length} setup={setup.length} onPress={() => setReminderOpen(true)} />
            )}
            {/* Grayed while off: tapping it explains the feature and offers to turn it on. */}
            <IconButton
              name="sync-outline"
              label={online.enabled ? 'Fetch prices online' : 'Fetch prices online (off): learn more'}
              muted={!online.enabled}
              onPress={online.open}
            />
            <IconButton
              name={hidden ? 'eye-off-outline' : 'eye-outline'}
              label={hidden ? 'Show amounts' : 'Hide amounts'}
              onPress={() => updateSettings({ hideAmounts: !hidden })}
            />
            <IconButton name="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
          </View>
        </View>

        <Text style={[styles.caption, { color: theme.textSecondary }]}>
          {summary.liabilitiesValue > 0 ? 'Net worth' : 'Total'}
        </Text>
        <Money value={summary.netWorth} rounded style={styles.hero} />
        <View style={styles.gainLine}>
          <Money value={perf.gain} signed colored rounded style={styles.gain} />
          <Percent ratio={perf.pct} style={styles.gain} />
          <Text style={{ color: theme.textMuted, fontSize: 14 }}>{periodLabel.toLowerCase()}</Text>
        </View>
        {!isEmpty && <GoalsCard />}

        {isEmpty ? (
          <Card style={{ marginTop: space.xl, alignItems: 'center', gap: space.md }}>
            <Ionicons name="wallet-outline" size={40} color={theme.primary} />
            <Text style={{ color: theme.text, fontSize: 16, textAlign: 'center' }}>
              Start by adding an account and your first investment.
            </Text>
            <Button title="Add your first investment" onPress={() => router.push('/add')} />
          </Card>
        ) : (
          <>
            <View style={{ marginTop: space.lg }}>
              <PeriodSelector />
            </View>

            <Card style={{ marginTop: space.md, gap: space.md }}>
              {hasDebts && (
                <Segmented
                  options={[
                    { value: 'networth', label: 'Net worth' },
                    { value: 'investments', label: 'Investments' },
                  ]}
                  value={chartView}
                  onChange={setChartView}
                />
              )}
              <HistoryChart
                points={chartPoints}
                hidden={hidden}
                valueLabel={showNetWorth ? 'Net worth' : 'Assets'}
                benchmarkLabel={`At ${rateLabel}`}
              />
            </Card>

            <SectionTitle>Performance · {periodLabel}</SectionTitle>
            <Card>
              {performance.start && (
                <Row label={`Value on ${formatDate(performance.start)}`}>
                  <Money value={perf.startValue} />
                </Row>
              )}
              <Row label={performance.start ? 'Money added (net)' : 'Money invested (net)'}>
                <Money value={perf.netFlows} signed={!!performance.start} />
              </Row>
              <Row label="Value today">
                <Money value={perf.endValue} />
              </Row>
              <GainBreakdown perf={perf} />
            </Card>

            <SectionTitle>Today</SectionTitle>
            <Card>
              <Row label="Assets">
                <Money value={summary.assetsValue} />
              </Row>
              <Row label="Invested (cost of what you hold)">
                <Money value={summary.invested} />
              </Row>
              <Row label="Unrealized gain">
                <Money value={summary.unrealized} signed colored />
              </Row>
              <Row label="Realized gain (all time)">
                <Money value={summary.realized} signed colored />
              </Row>
              <Row label="Annualized return (since start)">
                <AnnualizedReturn value={returns.total} compareTo={rate} />
              </Row>
              {benchmarkToday !== undefined && (
                <>
                  <Row label={`Same money at ${rateLabel}/yr`}>
                    <Money value={benchmarkToday} />
                  </Row>
                  <Row label={summary.assetsValue >= benchmarkToday ? `Ahead of ${rateLabel}` : `Behind ${rateLabel}`}>
                    <Money value={summary.assetsValue - benchmarkToday} signed colored />
                  </Row>
                </>
              )}
              {summary.liabilitiesValue > 0 && (
                <Row label="Debts">
                  <Money value={-summary.liabilitiesValue} />
                </Row>
              )}
              {summary.lastUpdate && <Row label="Last update">{formatDate(summary.lastUpdate)}</Row>}
            </Card>
          </>
        )}
      </ScrollView>

      <ModalCard
        visible={reminderOpen && hasReminders}
        onClose={() => setReminderOpen(false)}
        closeOnBackdrop
        plain
        style={{ maxHeight: '100%' }}>
        {/* Up to three sections: scrolls on small phones. */}
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.md }}>
          {staleness.stale > 0 && <UpdateReminder summary={staleness} onUpdate={() => closeAnd('/update-prices')} />}
          {reviews.length > 0 && (
            <ReviewReminder reviews={reviews} onOpen={(id) => closeAnd({ pathname: '/asset/[id]', params: { id: String(id) } })} />
          )}
          {setup.length > 0 && (
            <SetupReminder
              steps={setup}
              onOpen={(step) =>
                closeAnd({ pathname: '/insights', params: step === 'goal' ? { section: 'goals', at: String(Date.now()) } : { section: 'savings', focus: 'emergency', at: String(Date.now()) } })
              }
              onDismiss={() => updateSettings({ setupReminderDismissed: true })}
            />
          )}
        </ScrollView>
        <Button title="Later" variant="secondary" onPress={() => setReminderOpen(false)} />
      </ModalCard>
      {online.intro}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl * 2 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg },
  appName: { fontSize: 22, fontWeight: '700', flexShrink: 1, marginRight: space.sm },
  // Up to 5 buttons: tighter gap so they fit next to the title on small phones.
  actions: { flexDirection: 'row', gap: 6 },
  caption: { fontSize: 14 },
  hero: { fontSize: 38, fontWeight: '700', marginTop: 2 },
  gainLine: { flexDirection: 'row', gap: space.md, marginTop: space.xs },
  gain: { fontSize: 16, fontWeight: '600' },
});
