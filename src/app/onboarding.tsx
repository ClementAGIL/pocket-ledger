import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DashboardScene, LedgerScene, PlanScene, PrivacyScene, RemindersScene, WelcomeScene } from '@/components/onboarding/Illustrations';
import { Scene } from '@/components/onboarding/scene';
import { Button, TextLink } from '@/components/ui';
import { authenticate, checkLockAvailable } from '@/security/LockGate';
import { useDataMode } from '@/state/DataMode';
import { useData } from '@/state/DataProvider';
import { markOnboardingSeen } from '@/state/onboarding';
import { space, useTheme } from '@/theme';

interface Page {
  title: string;
  text: string;
  /** Animated picture (components/onboarding/Illustrations), each with its own choreography. */
  Picture: ComponentType;
}

const PAGES: Page[] = [
  {
    title: 'Welcome to Pocket Ledger',
    Picture: WelcomeScene,
    text: 'One place for everything you own and owe: investments, savings, crypto, property and loans. No bank connection, no account, no cloud: you enter it, it stays on this phone.',
  },
  {
    title: 'Note every move',
    Picture: LedgerScene,
    text: 'Add your accounts and investments, then buys, sells, dividends, deposits and loan payments. Monthly operations can be scheduled: the app proposes them when they’re due, you confirm.',
  },
  {
    title: 'See how you’re doing',
    Picture: DashboardScene,
    text: 'Net worth, gains over the month, the year or since the start, a chart marking your buys and sells, your allocation and your real yearly return.',
  },
  {
    title: 'Stay on top, gently',
    Picture: RemindersScene,
    text: 'Reminders tell you which prices to update and which investments to look at again, like one down 25%. Each month, a check-in sums the month up in one screen.',
  },
  {
    title: 'Plan ahead',
    Picture: PlanScene,
    text: 'Set a goal or your FIRE number and see when you’d reach it, size your emergency fund, and split new money to reach your target allocation.',
  },
  {
    title: 'Private by design',
    Picture: PrivacyScene,
    text: 'Lock the app with your fingerprint, face or PIN, hide amounts in one tap, and keep password-protected backups. Prices are fetched online only if you turn it on.',
  },
];

const LAST = PAGES.length - 1;

/** Introduction: shown once on the first start, again from Settings › Help. Swipe or press Next. */
export default function OnboardingScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);
  const float = useSharedValue(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    markOnboardingSeen();
    if (!reduceMotion) float.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduceMotion, float]);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });
  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: !reduceMotion });
    setPage(i);
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        {page < LAST && <TextLink title="Skip" onPress={close} />}
      </View>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {PAGES.map((p, i) => (
          <PageView key={p.title} page={p} index={i} width={width} scrollX={scrollX} float={float} onClose={close} />
        ))}
      </Animated.ScrollView>
      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`}>
          {PAGES.map((p, i) => (
            <Dot key={p.title} index={i} width={width} scrollX={scrollX} />
          ))}
        </View>
        {page < LAST ? (
          <Button title="Next" onPress={() => goTo(page + 1)} />
        ) : (
          <Button title="Get started" onPress={close} />
        )}
      </View>
    </SafeAreaView>
  );
}

function PageView({
  page,
  index,
  width,
  scrollX,
  float,
  onClose,
}: {
  page: Page;
  index: number;
  width: number;
  scrollX: SharedValue<number>;
  float: SharedValue<number>;
  onClose: () => void;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const range = [(index - 1) * width, index * width, (index + 1) * width];
  // The picture's timeline plays when the page comes into view (more than half shown) and rewinds
  // once it's fully off screen, so it plays again each time the page is reached.
  const progress = useSharedValue(0);
  const entered = useSharedValue(false);
  useAnimatedReaction(
    () => Math.abs(scrollX.value - index * width),
    (distance) => {
      if (distance < width * 0.5 && !entered.value) {
        entered.value = true;
        progress.value = reduceMotion ? 1 : withTiming(1, { duration: 2200, easing: Easing.linear });
      } else if (distance >= width * 0.98 && entered.value) {
        entered.value = false;
        cancelAnimation(progress);
        progress.value = 0;
      }
    },
    [index, width, reduceMotion],
  );
  // The picture fades with the swipe and the text slides a bit slower than the page (parallax).
  const pictureStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollX.value, range, [0, 1, 0], 'clamp') }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], 'clamp'),
    transform: [{ translateX: interpolate(scrollX.value, range, [width * 0.3, 0, -width * 0.3], 'clamp') }],
  }));
  const { Picture } = page;

  return (
    // Scrolls on short screens (the last page has buttons too).
    <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <Animated.View style={[styles.picture, pictureStyle]}>
        <Scene progress={progress} float={float}>
          <Picture />
        </Scene>
      </Animated.View>
      <Animated.View style={[styles.text, textStyle]}>
        <Text style={[styles.title, { color: theme.text }]}>{page.title}</Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>{page.text}</Text>
        {index === LAST && <PrivacyActions onClose={onClose} />}
      </Animated.View>
    </ScrollView>
  );
}

function Dot({ index, width, scrollX }: { index: number; width: number; scrollX: SharedValue<number> }) {
  const theme = useTheme();
  const range = [(index - 1) * width, index * width, (index + 1) * width];
  const style = useAnimatedStyle(() => ({
    width: interpolate(scrollX.value, range, [8, 24, 8], 'clamp'),
    opacity: interpolate(scrollX.value, range, [0.35, 1, 0.35], 'clamp'),
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: theme.primary }, style]} />;
}

/** Last page: turn the lock on right away, or look around the demo first. */
function PrivacyActions({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const { settings, updateSettings } = useData();
  const { isDemo, switchTo } = useDataMode();

  const enableLock = async () => {
    const problem = await checkLockAvailable();
    if (problem) return Alert.alert('Screen lock unavailable', problem);
    if (await authenticate('Enable app lock')) await updateSettings({ lockEnabled: true });
  };

  return (
    <View style={styles.actions}>
      {settings.lockEnabled ? (
        <View style={styles.lockOn}>
          <Ionicons name="checkmark-circle" size={20} color={theme.positive} />
          <Text style={{ color: theme.text }}>App lock is on</Text>
        </View>
      ) : (
        <Button title="Turn on the app lock" variant="outline" icon="finger-print" onPress={enableLock} />
      )}
      {!isDemo && (
        <Pressable
          onPress={() => {
            onClose();
            switchTo('demo');
          }}
          accessibilityRole="button"
          style={styles.demo}>
          <Ionicons name="flask-outline" size={18} color={theme.primary} />
          <Text style={{ color: theme.primary, fontWeight: '600' }}>Explore with demo data first</Text>
        </Pressable>
      )}
      <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: 'center' }}>
        Both can be changed later in Settings.{!isDemo && ' The demo is a separate database: your own data is never mixed with it.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { height: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: space.lg },
  page: { flexGrow: 1, alignItems: 'center', paddingHorizontal: space.xl, paddingBottom: space.lg },
  picture: { alignItems: 'center', justifyContent: 'center', marginTop: space.md },
  text: { alignItems: 'center', gap: space.md, marginTop: space.xl, maxWidth: 420 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 23, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: space.md, marginTop: space.sm },
  lockOn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 44 },
  demo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 44 },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
});
