import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StalenessIcon, stalenessColor } from '@/components/StalenessBadge';
import { Button, Card, TextLink } from '@/components/ui';
import { formatDate } from '@/domain/format';
import type { AssetView } from '@/domain/portfolio';
import type { SetupStep } from '@/domain/projection';
import { STALENESS_RANGES, type StalenessSummary } from '@/domain/staleness';
import { space, useTheme } from '@/theme';

/** Investments whose review date has come; each opens its page. */
export function ReviewReminder({ reviews, onOpen }: { reviews: AssetView[]; onOpen: (assetId: number) => void }) {
  const theme = useTheme();
  const shown = reviews.slice(0, 5);
  return (
    <Card style={[styles.reminder, { borderLeftColor: theme.staleWarning }]}>
      <View style={styles.reminderHeader}>
        <Ionicons name="flag" size={22} color={theme.staleWarning} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>
            {reviews.length} {reviews.length > 1 ? 'investments' : 'investment'} to review
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Re-read your notes and decide what to do.</Text>
        </View>
      </View>
      {shown.map((v) => (
        <Pressable
          key={v.asset.id}
          onPress={() => onOpen(v.asset.id)}
          accessibilityRole="button"
          style={[styles.reviewRow, { borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: theme.text }}>
              {v.asset.name}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              {v.account.name} · due {formatDate(v.asset.reviewDate!)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </Pressable>
      ))}
      {reviews.length > shown.length && (
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>and {reviews.length - shown.length} more in Investments</Text>
      )}
    </Card>
  );
}

/** How many prices are out of date, how old they are, and a shortcut to update them. */
export function UpdateReminder({ summary, onUpdate }: { summary: StalenessSummary; onUpdate: () => void }) {
  const theme = useTheme();
  const levels = (['critical', 'serious', 'warning', 'mild'] as const).filter((l) => summary.counts[l] > 0);
  return (
    <Card style={[styles.reminder, { borderLeftColor: stalenessColor(theme, summary.worst) }]}>
      <View style={styles.reminderHeader}>
        <StalenessIcon level={summary.worst} size={22} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>
            {summary.stale} {summary.stale > 1 ? 'prices need' : 'price needs'} an update
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Keep your portfolio value accurate.</Text>
        </View>
      </View>
      <View style={styles.reminderLevels}>
        {levels.map((level) => (
          <View key={level} style={styles.reminderLevel}>
            <StalenessIcon level={level} />
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {summary.counts[level]} · {STALENESS_RANGES[level]}
            </Text>
          </View>
        ))}
      </View>
      <Button title="Update prices" onPress={onUpdate} />
    </Card>
  );
}

const SETUP: Record<SetupStep, { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }> = {
  goal: { icon: 'flag-outline', title: 'Set a goal', detail: 'An amount or FIRE: see when you’ll reach it.' },
  emergency: { icon: 'umbrella-outline', title: 'Set up your emergency fund', detail: 'A few months of expenses kept in cash.' },
};

/** Goal and emergency fund not set yet (fresh install, reset): each line opens its Insights section. */
export function SetupReminder({
  steps,
  onOpen,
  onDismiss,
}: {
  steps: SetupStep[];
  onOpen: (step: SetupStep) => void;
  /** "Don't remind me": hides this reminder for good (the Home card still links to Goals). */
  onDismiss: () => void;
}) {
  const theme = useTheme();
  return (
    <Card style={[styles.reminder, { borderLeftColor: theme.primary }]}>
      <View style={styles.reminderHeader}>
        <Ionicons name="compass-outline" size={22} color={theme.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Plan ahead</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Takes a minute, and you can change it any time.</Text>
        </View>
      </View>
      {steps.map((step) => (
        <Pressable
          key={step}
          onPress={() => onOpen(step)}
          accessibilityRole="button"
          style={[styles.reviewRow, { borderColor: theme.border }]}>
          <Ionicons name={SETUP[step].icon} size={18} color={theme.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text }}>{SETUP[step].title}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>{SETUP[step].detail}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </Pressable>
      ))}
      <TextLink title="Don’t remind me" size={13} onPress={onDismiss} />
    </Card>
  );
}

const styles = StyleSheet.create({
  reminder: { gap: space.md, borderLeftWidth: 4 },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
  },
  reminderHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  reminderLevels: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  reminderLevel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
