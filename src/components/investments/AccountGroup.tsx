import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Money, Percent, Stat } from '@/components/ui';
import { formatPercent } from '@/domain/format';
import type { AccountGroup } from '@/domain/portfolio';
import { useData } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

import { Group } from './CategoryGroup';

/** Investments list › By account: an account card that expands into its categories, then investments. */
export function AccountCard({
  group,
  open,
  onToggle,
  isCategoryOpen,
  onToggleCategory,
}: {
  group: AccountGroup;
  open: boolean;
  onToggle: () => void;
  isCategoryOpen: (categoryId: number) => boolean;
  onToggleCategory: (categoryId: number) => void;
}) {
  const theme = useTheme();
  const { performance } = useData();
  const perf = performance.byAccount.get(group.account.id);
  const { account } = group;
  const assetsOnly = group.debts === 0;
  return (
    <Card style={styles.card}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.header}>
        <Ionicons name="wallet-outline" size={20} color={theme.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {account.name}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>
            {[account.institution, `${group.count} ${group.count > 1 ? 'items' : 'item'}`, group.value > 0 ? `${formatPercent(group.weight)} of assets` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Money value={group.value - group.debts} rounded style={styles.value} />
          {perf && group.value > 0 && (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Money value={perf.gain} signed colored rounded style={{ fontSize: 13 }} />
              <Percent ratio={perf.pct} style={{ fontSize: 13 }} />
            </View>
          )}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} />
      </Pressable>

      {open && (
        <View style={{ marginTop: space.sm }}>
          <View style={[styles.stats, { borderColor: theme.border }]}>
            {assetsOnly ? (
              <Stat label="Invested">
                <Money value={group.invested} rounded style={styles.statValue} />
              </Stat>
            ) : (
              <>
                <Stat label="Assets">
                  <Money value={group.value} rounded style={styles.statValue} />
                </Stat>
                <Stat label="Debts">
                  <Money value={-group.debts} rounded style={styles.statValue} />
                </Stat>
              </>
            )}
            <Stat label="Unrealized">
              <Money value={group.value - group.invested} signed colored rounded style={styles.statValue} />
            </Stat>
            <Stat label="Income">
              <Money value={perf?.income ?? 0} rounded style={styles.statValue} />
            </Stat>
          </View>
          {group.groups.map((g) => (
            <Group
              key={g.category.id}
              group={g}
              nested
              open={isCategoryOpen(g.category.id)}
              onToggle={() => onToggleCategory(g.category.id)}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  name: { fontSize: 17, fontWeight: '600' },
  value: { fontSize: 16, fontWeight: '600' },
  stats: {
    flexDirection: 'row',
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statValue: { fontSize: 14, fontWeight: '500' },
});
