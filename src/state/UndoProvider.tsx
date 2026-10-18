import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, useTheme } from '@/theme';

/** How long the "Undo" banner stays. */
const UNDO_MS = 5000;
/** Keeps the banner above the tab bar. */
const TAB_BAR_CLEARANCE = 64;

type ShowUndo = (message: string, undo: () => Promise<unknown>) => void;

const UndoContext = createContext<ShowUndo | null>(null);

/**
 * App-wide "Deleted · Undo" banner. Mounted at the root so it survives the navigation that often
 * follows a deletion. A new deletion replaces the current banner.
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState<{ id: number; message: string; undo: () => Promise<unknown> } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPending(null);
  }, []);

  const show = useCallback<ShowUndo>((message, undo) => {
    if (timer.current) clearTimeout(timer.current);
    setPending({ id: Date.now(), message, undo });
    timer.current = setTimeout(() => setPending(null), UNDO_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const undo = async () => {
    if (!pending) return;
    const action = pending.undo;
    dismiss();
    try {
      await action();
    } catch (e) {
      Alert.alert('Could not undo', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <UndoContext.Provider value={show}>
      {children}
      {pending && (
        // Keyed by deletion: a new deletion restarts the countdown.
        <UndoBanner key={pending.id} message={pending.message} onUndo={undo} bottom={insets.bottom + TAB_BAR_CLEARANCE} />
      )}
    </UndoContext.Provider>
  );
}

/** The banner: message, "Undo · 4" countdown, and a bar shrinking until the undo expires. */
function UndoBanner({ message, onUndo, bottom }: { message: string; onUndo: () => void; bottom: number }) {
  const theme = useTheme();
  const [seconds, setSeconds] = useState(Math.ceil(UNDO_MS / 1000));
  const [progress] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const end = Date.now() + UNDO_MS;
    const tick = setInterval(() => setSeconds(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 200);
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: UNDO_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      clearInterval(tick);
      animation.stop();
    };
  }, [progress]);

  return (
    <View accessibilityLiveRegion="polite" style={[styles.banner, { backgroundColor: theme.text, bottom }]}>
      <View style={styles.content}>
        <Text style={[styles.message, { color: theme.background }]} numberOfLines={2}>
          {message}
        </Text>
        <Pressable
          onPress={onUndo}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Undo: ${message}. ${seconds} seconds left`}>
          <Text style={[styles.action, { color: theme.background }]}>
            Undo <Text style={styles.seconds}>· {seconds}</Text>
          </Text>
        </Pressable>
      </View>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.bar,
            { backgroundColor: theme.background, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>
    </View>
  );
}

/** `showUndo(message, undo)`: shows the banner; `undo` runs if the user taps "Undo" within 5 s. */
export function useUndo(): ShowUndo {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error('useUndo must be used inside <UndoProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  content: {
    minHeight: 48,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  message: { flex: 1, fontSize: 15 },
  seconds: { fontWeight: '400', fontVariant: ['tabular-nums'] },
  track: { height: 3 },
  bar: { height: 3, opacity: 0.6 },
  action: { fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
