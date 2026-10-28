import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { ensureDailyBackup } from '@/backup/autoBackup';
import * as repo from '@/db/repo';
import { today } from '@/domain/dates';
import { buildPerformance, isPeriod, type Period, type PortfolioPerformance } from '@/domain/performance';
import { buildPortfolio, type Portfolio } from '@/domain/portfolio';
import { parseProjectionSettings, type ProjectionSettings } from '@/domain/projection';
import { buildReturns, type PortfolioReturns } from '@/domain/returns';
import type { ISODate, Snapshot } from '@/domain/types';

import { useDataMode } from './DataMode';

export interface Settings {
  hideAmounts: boolean;
  lockEnabled: boolean;
  /** Period used for gains everywhere in the app. */
  period: Period;
  /** Yearly rate of the "what if" comparison line (0.04 = 4%); 0 hides it. */
  benchmarkRate: number;
  /** Monthly local notification to update prices. */
  reminderEnabled: boolean;
  /** 1–28. */
  reminderDay: number;
  reminderHour: number;
  /** Local safety-net backups (daily + before risky actions). */
  autoBackupEnabled: boolean;
  /** How many automatic backups to keep. */
  autoBackupKeep: number;
  /** Allows the user-triggered "Fetch prices online" (the only network use). Off by default. */
  onlinePricesEnabled: boolean;
  /** "Don't remind me" on the Home reminder to set a goal and an emergency fund. */
  setupReminderDismissed: boolean;
  /** Insights › Goals choices (rate, saving, goal, horizon). Stored as JSON. */
  projection: ProjectionSettings;
}

const intSetting = (raw: string | undefined, min: number, max: number, fallback: number) => {
  const n = Number(raw);
  return raw !== undefined && Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

interface DataContextValue {
  db: SQLiteDatabase;
  snapshot: Snapshot;
  portfolio: Portfolio;
  /** Performance over `settings.period`. */
  performance: PortfolioPerformance;
  /** Real annualized return (XIRR) since the start, overall and per investment. */
  returns: PortfolioReturns;
  settings: Settings;
  /**
   * Today's local date, refreshed when the app comes back to the foreground: everything computed
   * "as of today" (gains, reminders, reviews, charts) follows it. Read it with `useToday()`.
   */
  today: ISODate;
  /** Reloads everything from the database. */
  refresh: () => Promise<void>;
  /** Runs `fn` in an exclusive transaction, then refreshes. */
  write: <T>(fn: (txn: SQLiteDatabase) => Promise<T>) => Promise<T>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

const parseSettings = (raw: Record<string, string>): Settings => ({
  hideAmounts: raw.hideAmounts === '1',
  lockEnabled: raw.lockEnabled === '1',
  period: isPeriod(raw.period) ? raw.period : 'ALL',
  benchmarkRate: raw.benchmarkRate !== undefined && Number.isFinite(Number(raw.benchmarkRate)) ? Number(raw.benchmarkRate) : 0.04,
  reminderEnabled: raw.reminderEnabled === '1',
  reminderDay: intSetting(raw.reminderDay, 1, 28, 1),
  reminderHour: intSetting(raw.reminderHour, 0, 23, 9),
  autoBackupEnabled: raw.autoBackupEnabled !== '0',
  autoBackupKeep: intSetting(raw.autoBackupKeep, 1, 100, 10),
  onlinePricesEnabled: raw.onlinePricesEnabled === '1',
  setupReminderDismissed: raw.setupReminderDismissed === '1',
  projection: parseProjectionSettings(raw.projection),
});

const serializeSetting = (value: Settings[keyof Settings]) =>
  typeof value === 'boolean' ? (value ? '1' : '0') : typeof value === 'object' ? JSON.stringify(value) : String(value);

export function DataProvider({ children, onReady }: { children: ReactNode; onReady?: () => void }) {
  const db = useSQLiteContext();
  const { isDemo } = useDataMode();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [day, setDay] = useState(today);

  // The app is often resumed from the background on another day: recompute as of the new date.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setDay(today());
    });
    return () => sub.remove();
  }, []);

  const refresh = useCallback(async () => {
    setSnapshot(await repo.loadSnapshot(db));
  }, [db]);

  useEffect(() => {
    (async () => {
      try {
        const [s, raw] = await Promise.all([repo.loadSnapshot(db), repo.loadSettings(db)]);
        setSnapshot(s);
        // Demo data is rebuilt on each opening: no automatic backups, which would also push the real ones out.
        setSettings({ ...parseSettings(raw), ...(isDemo && { autoBackupEnabled: false }) });
      } catch (e) {
        setLoadError(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  }, [db, isDemo]);

  const ready = snapshot !== null && settings !== null;
  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);

  const backupEnabled = settings?.autoBackupEnabled ?? true;
  const backupKeep = settings?.autoBackupKeep ?? 10;

  const write = useCallback(
    async <T,>(fn: (txn: SQLiteDatabase) => Promise<T>) => {
      // Safety net: the first change of the day first saves the data as it was before it.
      if (backupEnabled) {
        await ensureDailyBackup(db, backupKeep).catch(() => {
          // Best effort: never block a change because a backup failed.
        });
      }
      let result!: T;
      await db.withExclusiveTransactionAsync(async (txn) => {
        result = await fn(txn);
      });
      await refresh();
      return result;
    },
    [db, refresh, backupEnabled, backupKeep],
  );

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      // Update the UI first so toggles feel instant, then persist.
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
      for (const [key, value] of Object.entries(patch)) await repo.setSetting(db, key, serializeSetting(value));
    },
    [db],
  );

  const portfolio = useMemo(() => (snapshot ? buildPortfolio(snapshot) : null), [snapshot]);
  const period = settings?.period;
  const performance = useMemo(
    () => (snapshot && portfolio && period ? buildPerformance(portfolio, period, day) : null),
    [snapshot, portfolio, period, day],
  );

  const returns = useMemo(() => (portfolio ? buildReturns(portfolio, day) : null), [portfolio, day]);

  // Thrown while rendering so the root ErrorBoundary shows it (otherwise: splash forever).
  if (loadError) throw loadError;
  if (!ready || !portfolio || !performance || !returns) return null;

  return (
    <DataContext.Provider value={{ db, snapshot, portfolio, performance, returns, settings, today: day, refresh, write, updateSettings }}>
      {children}
    </DataContext.Provider>
  );
}

/** Today's date for anything shown or computed while rendering (see `DataContextValue.today`). */
export function useToday() {
  return useData().today;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
