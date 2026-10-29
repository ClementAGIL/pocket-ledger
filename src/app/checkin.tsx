import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { Confetti } from "@/components/celebration/Confetti";
import { useMilestoneText } from "@/components/celebration/GoalCelebration";
import { GainBreakdown } from "@/components/GainBreakdown";
import {
  ReviewReminder,
  ScheduledReminder,
  UpdateReminder,
} from "@/components/home/Reminders";
import { formatMonth } from "@/components/SavingsChart";
import { LossBadge } from "@/components/StalenessBadge";
import {
  Card,
  Money,
  Percent,
  Row,
  SectionTitle,
  TextLink,
} from "@/components/ui";
import {
  buildCheckIn,
  checkInRange,
  lastCompleteMonth,
  shiftMonth,
  type Mover,
} from "@/domain/checkin";
import { formatDate } from "@/domain/format";
import { milestones, newlyReached, type Milestone } from "@/domain/milestones";
import { bigLoss, reviewReason, reviewsDue } from "@/domain/reviews";
import { dueOccurrences } from "@/domain/schedules";
import { summarizeStaleness } from "@/domain/staleness";
import { useData, useToday } from "@/state/DataProvider";
import { space, useTheme } from "@/theme";

/** Monthly check-in (?month=YYYY-MM, default the last complete month): the month, then what needs doing now. */
export default function CheckInScreen() {
  const theme = useTheme();
  const now = useToday();
  const params = useLocalSearchParams<{ month?: string }>();
  const { portfolio, snapshot, settings, updateSettings } = useData();
  const range = checkInRange(snapshot, now);
  const clamp = (m: string) =>
    !range
      ? m
      : m < range.first
        ? range.first
        : m > range.last
          ? range.last
          : m;
  const [month, setMonth] = useState(() =>
    clamp(
      /^\d{4}-\d{2}$/.test(params.month ?? "")
        ? params.month!
        : lastCompleteMonth(now),
    ),
  );

  const checkIn = useMemo(
    () => buildCheckIn(portfolio, snapshot, month, now),
    [portfolio, snapshot, month, now],
  );
  // Today's to-dos, whatever month is shown.
  const staleness = useMemo(
    () => summarizeStaleness(portfolio.byAssetId.values(), now),
    [portfolio, now],
  );
  const views = [...portfolio.byAssetId.values()];
  const losses = views
    .filter((v) => bigLoss(v) !== null)
    .sort((a, b) => bigLoss(a)! - bigLoss(b)!);
  // Big losses have their own card: here only the reviews whose date has come.
  const reviews = reviewsDue(views, now).filter(
    (v) => reviewReason(v, now) === "date",
  );

  const scheduledDue = useMemo(
    () => dueOccurrences(snapshot.schedules, portfolio.byAssetId, now).length,
    [snapshot, portfolio, now],
  );

  // Seen: the Home card for this month goes away.
  const latest = lastCompleteMonth(now);
  useEffect(() => {
    if (month === latest && settings.checkInSeen !== latest)
      updateSettings({ checkInSeen: latest });
  }, [month, latest, settings.checkInSeen, updateSettings]);

  const openAsset = (id: number) =>
    router.push({ pathname: "/asset/[id]", params: { id: String(id) } });
  const { total, savings } = checkIn;
  // A goal crossed during the month (against today's targets): celebrated here too.
  const reached = useMemo(
    () =>
      newlyReached(
        milestones(settings.projection),
        checkIn.values.start,
        checkIn.values.end,
      ),
    [settings.projection, checkIn],
  );
  const { width } = useWindowDimensions();
  const hasDebts = savings.borrowed > 0.005 || savings.repaid > 0.005;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={styles.content}
        style={{ backgroundColor: theme.background }}
      >
        <View style={styles.monthBar}>
          <MonthArrow
            icon="chevron-back"
            label="Previous month"
            disabled={!range || month <= range.first}
            onPress={() => setMonth(shiftMonth(month, -1))}
          />
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text style={[styles.month, { color: theme.text }]}>
              {formatMonth(month, true)}
            </Text>
            {checkIn.partial && (
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                So far, to {formatDate(checkIn.end)}
              </Text>
            )}
          </View>
          <MonthArrow
            icon="chevron-forward"
            label="Next month"
            disabled={!range || month >= range.last}
            onPress={() => setMonth(shiftMonth(month, 1))}
          />
        </View>

        {reached.length > 0 && <ReachedCard reached={reached} month={month} />}

        <Card style={{ gap: space.xs }}>
          <Text style={{ color: theme.textSecondary }}>Gain</Text>
          <View style={styles.gainLine}>
            <Money
              value={total.gain}
              signed
              colored
              rounded
              style={styles.hero}
            />
            <Percent ratio={total.pct} style={styles.heroPct} />
          </View>
          <View style={{ marginTop: space.sm }}>
            <Row label={`Value on ${formatDate(checkIn.start)}`}>
              <Money value={total.startValue} />
            </Row>
            <Row label="Money added (net)">
              <Money value={total.netFlows} signed />
            </Row>
            <Row label={`Value on ${formatDate(checkIn.end)}`}>
              <Money value={total.endValue} />
            </Row>
          </View>
          <GainBreakdown perf={total} />
        </Card>

        <SectionTitle>Saved</SectionTitle>
        <Card>
          <Row label="Put in">
            <Money value={savings.added} />
          </Row>
          <Row label="Taken out">
            <Money value={-savings.withdrawn} />
          </Row>
          {hasDebts && (
            <>
              <Row label="Borrowed">
                <Money value={-savings.borrowed} />
              </Row>
              <Row label="Loans repaid">
                <Money value={savings.repaid} />
              </Row>
            </>
          )}
          <Row label="Saved (net)">
            <Money value={savings.net} signed colored />
          </Row>
          <TextLink
            title="All months in Savings"
            size={13}
            chevron
            style={{ marginTop: space.sm }}
            onPress={() =>
              router.push({
                pathname: "/insights",
                params: { section: "savings", at: String(Date.now()) },
              })
            }
          />
        </Card>

        <SectionTitle>Biggest movers</SectionTitle>
        <Card>
          {checkIn.gainers.length === 0 && checkIn.losers.length === 0 ? (
            <Text style={{ color: theme.textMuted }}>No moves this month.</Text>
          ) : (
            [...checkIn.gainers, ...checkIn.losers].map((m) => (
              <MoverRow
                key={m.view.asset.id}
                mover={m}
                onPress={() => openAsset(m.view.asset.id)}
              />
            ))
          )}
        </Card>

        <SectionTitle>Today</SectionTitle>
        <View style={{ gap: space.md }}>
          {losses.length > 0 && (
            <Card
              style={[styles.lossCard, { borderLeftColor: theme.negative }]}
            >
              <View style={styles.cardHeader}>
                <Ionicons
                  name="trending-down"
                  size={22}
                  color={theme.negative}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 16,
                      fontWeight: "600",
                    }}
                  >
                    {losses.length}{" "}
                    {losses.length > 1 ? "investments" : "investment"} down 25%
                    or more
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                    Compared to what you paid. Still the plan?
                  </Text>
                </View>
              </View>
              {losses.map((v) => (
                <Pressable
                  key={v.asset.id}
                  onPress={() => openAsset(v.asset.id)}
                  accessibilityRole="button"
                  style={[styles.row, { borderColor: theme.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: theme.text }}>
                      {v.asset.name}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                      {v.account.name}
                      {v.asset.reviewDate && v.asset.reviewDate > now
                        ? ` · review on ${formatDate(v.asset.reviewDate)}`
                        : ""}
                    </Text>
                  </View>
                  <LossBadge loss={bigLoss(v)!} />
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={theme.textMuted}
                  />
                </Pressable>
              ))}
            </Card>
          )}
          {staleness.stale > 0 && (
            <UpdateReminder
              summary={staleness}
              onUpdate={() => router.push("/update-prices")}
            />
          )}
          {reviews.length > 0 && (
            <ReviewReminder reviews={reviews} onOpen={openAsset} />
          )}
          {scheduledDue > 0 && (
            <ScheduledReminder
              count={scheduledDue}
              onOpen={() => router.push("/scheduled")}
            />
          )}
          {losses.length === 0 &&
            staleness.stale === 0 &&
            reviews.length === 0 &&
            scheduledDue === 0 && (
              <Card style={styles.cardHeader}>
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={theme.positive}
                />
                <Text style={{ color: theme.text, flex: 1 }}>
                  All up to date: prices, reviews, nothing down 25% or more.
                </Text>
              </Card>
            )}
        </View>
      </ScrollView>
      {/* Replays on each month that reached a goal. */}
      {reached.length > 0 && (
        <Confetti key={month} origin={{ x: width / 2, y: 110 }} />
      )}
    </View>
  );
}

/** A goal reached during the month shown. */
function ReachedCard({
  reached,
  month,
}: {
  reached: Milestone[];
  month: string;
}) {
  const theme = useTheme();
  const describe = useMilestoneText();
  return (
    <Card style={[styles.reached, { borderLeftColor: theme.categorical[3] }]}>
      <View style={[styles.trophy, { backgroundColor: theme.categorical[3] }]}>
        <Ionicons name="trophy" size={24} color={theme.onPrimary} />
      </View>
      <View style={{ flex: 1, gap: space.xs }}>
        <Text style={[styles.reachedTitle, { color: theme.text }]}>
          {reached.length > 1
            ? "Two goals reached"
            : describe(reached[0]).title}{" "}
          in {formatMonth(month, true)}
        </Text>
        {reached.map((m) => (
          <Text key={m.key} style={{ color: theme.textSecondary }}>
            {describe(m).text}
          </Text>
        ))}
      </View>
    </Card>
  );
}

function MonthArrow({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: "chevron-back" | "chevron-forward";
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={styles.arrow}
    >
      <Ionicons
        name={icon}
        size={24}
        color={disabled ? theme.border : theme.primary}
      />
    </Pressable>
  );
}

function MoverRow({ mover, onPress }: { mover: Mover; onPress: () => void }) {
  const theme = useTheme();
  const { view, perf } = mover;
  const up = perf.gain > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.row, { borderColor: theme.border }]}
    >
      <Ionicons
        name={up ? "arrow-up" : "arrow-down"}
        size={16}
        color={up ? theme.positive : theme.negative}
      />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: theme.text }}>
          {view.asset.name}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
          {view.account.name}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Money
          value={perf.gain}
          signed
          colored
          rounded
          style={{ fontWeight: "600" }}
        />
        <Percent ratio={perf.pct} style={{ fontSize: 12 }} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl * 2 },
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: space.md,
  },
  month: { fontSize: 20, fontWeight: "700" },
  arrow: { padding: space.sm },
  gainLine: { flexDirection: "row", alignItems: "baseline", gap: space.md },
  hero: { fontSize: 30, fontWeight: "700" },
  heroPct: { fontSize: 16, fontWeight: "600" },
  lossCard: { gap: space.md, borderLeftWidth: 4 },
  reached: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderLeftWidth: 4,
  },
  trophy: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  reachedTitle: { fontSize: 17, fontWeight: "700" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: space.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    paddingVertical: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
