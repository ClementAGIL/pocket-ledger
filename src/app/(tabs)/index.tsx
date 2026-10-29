import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useRootNavigationState } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnnualizedReturn } from '@/components/AnnualizedReturn';
import { GainBreakdown } from '@/components/GainBreakdown';
import { GoalsCard } from '@/components/GoalsCard';
import { CheckInCard } from '@/components/home/CheckInCard';
import { useOnlinePricesEntry } from '@/components/OnlinePricesIntro';
import { HistoryChart, type ChartPoint } from '@/components/HistoryChart';
import { IconButton, ReminderButton } from '@/components/home/HeaderButtons';
import { ReviewReminder, ScheduledReminder, SetupReminder, UpdateReminder } from '@/components/home/Reminders';
import { PeriodSelector } from '@/components/PeriodSelector';
import { Button, Card, ModalCard, Money, Percent, Row, SectionTitle, Segmented, TextLink } from '@/components/ui';
import { addMonths } from '@/domain/dates';
import { formatDate, formatPercent } from '@/domain/format';
import { benchmarkSeries } from '@/domain/benchmark';
import { checkInDue, checkInRange } from '@/domain/checkin';
import { buildHistory, downsample, moneyFlows, sliceHistory, type HistoryPoint } from '@/domain/history';
import { PERIOD_LABELS } from '@/domain/performance';
import { chartProjectionMonths, missingSetup, nominalPlan, projectMonths, savingPace } from '@/domain/projection';
import { reviewsDue } from '@/domain/reviews';
import { dueOccurrences } from '@/domain/schedules';
import { summarizeStaleness } from '@/domain/staleness';
import { useMoney } from '@/hooks/useMoney';
import { useDataMode } from '@/state/DataMode';
import { useData, useToday } from '@/state/DataProvider';
import { markOnboardingSeen, onboardingSeen } from '@/state/onboarding';
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
    // The orange line is the money put in, so dividends and gains show as the gap above it.
    const points = buildHistory(
      [...portfolio.byAssetId.values()].map((v) => ({ steps: v.steps, isLiability: v.isLiability })),
      now,
      moneyFlows(portfolio),
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
  const realPoints: ChartPoint[] = showNetWorth ? points.map((p) => ({ date: p.date, value: p.value - p.liabilities })) : points;

  // "With projection": the Goals plan (rate and saving) in future euros, after today, for as long
  // as the period shown. Debts stay as they are today.
  const { money } = useMoney({ rounded: true });
  const projectionOn = settings.chartProjection;
  const pace = useMemo(() => (projectionOn ? savingPace(snapshot, now).yearly : 0), [projectionOn, snapshot, now]);
  const last = history[history.length - 1];
  const plan = nominalPlan(settings.projection, last?.value ?? 0, returns.total.meaningful ? returns.total.rate : null, pace);
  const projected: ChartPoint[] =
    projectionOn && last
      ? projectMonths(plan, chartProjectionMonths(performance.period, history[0].date, now))
          .slice(1)
          .map((p) => ({
            date: addMonths(now, p.month),
            ...(showNetWorth
              ? { value: p.value - last.liabilities }
              : { value: p.value, invested: last.invested + p.contributed - plan.start }),
            projected: true,
          }))
      : [];
  const chartPoints = projected.length ? [...realPoints, ...projected] : realPoints;

  const isEmpty = portfolio.byAssetId.size === 0;
  const staleness = useMemo(() => summarizeStaleness(portfolio.byAssetId.values(), now), [portfolio, now]);
  const reviews = useMemo(() => reviewsDue(portfolio.byAssetId.values(), now), [portfolio, now]);
  // Fresh install or reset: offer to set a goal and an emergency fund, until done or dismissed.
  const setup = settings.setupReminderDismissed ? [] : missingSetup(settings.projection);
  const scheduledDue = useMemo(() => dueOccurrences(snapshot.schedules, portfolio.byAssetId, now).length, [snapshot, portfolio, now]);
  const hasReminders = staleness.stale > 0 || reviews.length > 0 || scheduledDue > 0 || setup.length > 0;
  const [reminderOpen, setReminderOpen] = useState(false);
  // First days of a month: last month's check-in, until opened.
  const checkInMonth = isEmpty ? null : checkInDue(checkInRange(snapshot, now), settings.checkInSeen, now);
  const online = useOnlinePricesEntry();
  const { isDemo, switchTo } = useDataMode();
  // One way only from here: the way back is in Settings, behind a confirmation (no accidental reveal).
  // No confirmation on the way in: a dialog would leave the real amounts visible behind it.
  const showDemo = () => switchTo('demo');
  // First start: the introduction, once the navigator can open it. An install that already has
  // data (an update) skips it; it stays in Settings › Help.
  const navReady = !!useRootNavigationState()?.key;
  useEffect(() => {
    if (!navReady || onboardingSeen()) return;
    markOnboardingSeen();
    if (!isDemo && snapshot.assets.length === 0) router.push('/onboarding');
    // Only when the navigator becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navReady]);
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
              <ReminderButton summary={staleness} reviews={reviews.length} scheduled={scheduledDue} setup={setup.length} onPress={() => setReminderOpen(true)} />
            )}
            <IconButton name="calendar-outline" label="Monthly check-in" onPress={() => router.push('/checkin')} />
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
            {!isDemo && <IconButton name="flask-outline" label="Show demo data" onPress={showDemo} />}
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
        {checkInMonth && <CheckInCard month={checkInMonth} />}
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
                investedLabel="Money put in"
                benchmarkLabel={`At ${rateLabel}`}
              />
              <View style={styles.projectionToggle}>
                <Text style={{ color: theme.textSecondary }}>With projection</Text>
                <Switch value={projectionOn} onValueChange={(v) => updateSettings({ chartProjection: v })} />
              </View>
              {projectionOn && (
                <View style={{ gap: space.xs }}>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    Dashed: at {formatPercent(plan.rate)}/yr and {money(plan.yearlySaving, { signed: true })}/yr, the plan set in Goals
                    {showNetWorth && summary.liabilitiesValue > 0 ? ', debts unchanged' : ''}. An estimate, not a forecast.
                  </Text>
                  <TextLink
                    title="Change in Goals"
                    size={13}
                    chevron
                    onPress={() => router.push({ pathname: '/insights', params: { section: 'goals', at: String(Date.now()) } })}
                  />
                </View>
              )}
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
              <TextLink title="Monthly check-in" size={13} chevron style={{ marginTop: space.sm }} onPress={() => router.push('/checkin')} />
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
        {/* Up to four sections: scrolls on small phones. */}
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.md }}>
          {staleness.stale > 0 && <UpdateReminder summary={staleness} onUpdate={() => closeAnd('/update-prices')} />}
          {reviews.length > 0 && (
            <ReviewReminder reviews={reviews} onOpen={(id) => closeAnd({ pathname: '/asset/[id]', params: { id: String(id) } })} />
          )}
          {scheduledDue > 0 && <ScheduledReminder count={scheduledDue} onOpen={() => closeAnd('/scheduled')} />}
          {setup.length > 0 && (
            <SetupReminder
              steps={setup}
              onOpen={(step) =>
                closeAnd({ pathname: '/insights', params: step === 'goal' ? { section: 'goals', at: String(Date.now()) } : { section: 'savings', focus: 'emergency', at: String(Date.now()) } })
              }
              onDismiss={() => updateSettings({ setupReminderDismissed: true })}
            />
          )}
          <TextLink title="Monthly check-in" size={13} chevron onPress={() => closeAnd('/checkin')} />
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
  // Up to 6 buttons: tighter gap so they fit next to the title on small phones (the title shrinks first).
  actions: { flexDirection: 'row', gap: 6 },
  caption: { fontSize: 14 },
  projectionToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hero: { fontSize: 38, fontWeight: '700', marginTop: 2 },
  gainLine: { flexDirection: 'row', gap: space.md, marginTop: space.xs },
  gain: { fontSize: 16, fontWeight: '600' },
});
