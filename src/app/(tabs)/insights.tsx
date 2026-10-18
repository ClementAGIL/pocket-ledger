import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MonthlySavings } from '@/components/MonthlySavings';
import { Simulation } from '@/components/Simulation';
import { TargetAllocation } from '@/components/TargetAllocation';
import { Segmented } from '@/components/ui';
import { space, useTheme } from '@/theme';

type Section = 'savings' | 'targets' | 'goals';
const isSection = (v: unknown): v is Section => v === 'savings' || v === 'targets' || v === 'goals';

/**
 * Analysis features, one at a time: pick the section at the top. Other screens can open a section
 * with `?section=goals&at=<timestamp>` (`at` makes a repeated link count again);
 * `&focus=emergency` also scrolls Savings down to the emergency fund.
 */
export default function InsightsScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ section?: string; at?: string; focus?: string }>();
  const [section, setSection] = useState<Section>(isSection(params.section) ? params.section : 'savings');
  // Follow a new link while the tab stays mounted (adjusting state during render, not in an effect).
  const [link, setLink] = useState(params.at);
  if (params.at !== link) {
    setLink(params.at);
    if (isSection(params.section)) setSection(params.section);
  }
  // Targets opened from the emergency fund: extra cash to invest (pre-filled), or straight into the editor.
  const [targetsIntent, setTargetsIntent] = useState<{ invest?: number; edit?: boolean }>({});
  const scroll = useRef<ScrollView>(null);

  // Scroll to the emergency fund once both positions are known (the card may still be mounting).
  const sectionY = useRef<number | null>(null);
  const emergencyY = useRef<number | null>(null);
  const pendingFocus = useRef(params.focus === 'emergency');
  const scrollToFocus = () => {
    if (!pendingFocus.current || sectionY.current === null || emergencyY.current === null) return;
    pendingFocus.current = false;
    scroll.current?.scrollTo({ y: sectionY.current + emergencyY.current - space.md, animated: true });
  };
  useEffect(() => {
    pendingFocus.current = params.focus === 'emergency';
    scrollToFocus();
    // Only when a new link arrives (`at`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.at]);
  const choose = (next: Section) => {
    setTargetsIntent({});
    setSection(next);
  };
  return (
    <ScrollView
      ref={scroll}
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Segmented
        options={[
          { value: 'savings', label: 'Savings' },
          { value: 'targets', label: 'Targets' },
          { value: 'goals', label: 'Goals' },
        ]}
        value={section}
        onChange={choose}
      />
      <View
        style={{ marginTop: space.lg }}
        onLayout={(e) => {
          sectionY.current = e.nativeEvent.layout.y;
          scrollToFocus();
        }}>
        {section === 'savings' ? (
          <MonthlySavings
            onEmergencyLayout={(y) => {
              emergencyY.current = y;
              scrollToFocus();
            }}
            onTargets={(intent) => {
              setTargetsIntent(intent);
              setSection('targets');
              scroll.current?.scrollTo({ y: 0, animated: false });
            }}
          />
        ) : section === 'targets' ? (
          <TargetAllocation investAmount={targetsIntent.invest} startEditing={targetsIntent.edit} />
        ) : (
          <Simulation />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl * 2 },
});
