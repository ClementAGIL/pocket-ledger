import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { AllocationCard } from '@/components/AllocationCard';
import { Group } from '@/components/investments/CategoryGroup';
import { PeriodSelector } from '@/components/PeriodSelector';
import { Chips, Segmented } from '@/components/ui';
import { SORT_OPTIONS, sortGroups, type SortDirection, type SortKey } from '@/domain/sorting';
import { useData } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

export default function InvestmentsScreen() {
  const theme = useTheme();
  const { portfolio, performance } = useData();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showClosed, setShowClosed] = useState(false);
  const [mode, setMode] = useState<'list' | 'allocation'>('list');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const groups = sortGroups(portfolio.groups, sortKey, sortDir, performance)
    .map((g) => ({ ...g, items: g.items.filter((v) => showClosed || (!v.isClosed && !v.asset.archived)) }))
    .filter((g) => g.items.length > 0);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Segmented
        options={[
          { value: 'list', label: 'List' },
          { value: 'allocation', label: 'Allocation' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'allocation' ? (
        portfolio.summary.assetsValue > 0 ? (
          <AllocationCard />
        ) : (
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: space.xl }}>
            Nothing to show yet: add an investment first.
          </Text>
        )
      ) : (
        <>
          <PeriodSelector />
          <View style={styles.sortRow}>
            <View style={{ flex: 1 }}>
              <Chips options={SORT_OPTIONS} value={sortKey} onChange={setSortKey} />
            </View>
            <Pressable
              onPress={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={sortDir === 'desc' ? 'Largest first, tap for smallest first' : 'Smallest first, tap for largest first'}
              style={[styles.sortDir, { backgroundColor: theme.surfaceAlt }]}>
              <Ionicons name={sortDir === 'desc' ? 'arrow-down' : 'arrow-up'} size={18} color={theme.text} />
            </Pressable>
          </View>
          {groups.length === 0 ? (
            <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: space.xl }}>
              No investments yet. Use the Add tab to create one.
            </Text>
          ) : (
            groups.map((g) => (
              <Group key={g.category.id} group={g} open={expanded.has(g.category.id)} onToggle={() => toggle(g.category.id)} />
            ))
          )}
          <View style={styles.closedToggle}>
            <Text style={{ color: theme.textSecondary }}>Show closed & archived</Text>
            <Switch value={showClosed} onValueChange={setShowClosed} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  sortRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  sortDir: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  closedToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.xs,
    marginTop: space.sm,
  },
});
