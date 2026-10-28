import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import { resetWithDemoData } from '@/db/demo';
import { migrate } from '@/db/migrations';

/*
 * Demo mode: a second database file with the demo portfolio, to show the app without showing one's
 * own data. The real database is never opened nor changed while in demo mode. The active mode is
 * stored outside both databases (expo-sqlite's key-value store), so the app reopens in the same mode.
 */

export type DataMode = 'real' | 'demo';

const MODE_KEY = 'dataMode';
const DATABASE_NAMES: Record<DataMode, string> = { real: 'pocketledger.db', demo: 'pocketledger-demo.db' };

function readMode(): DataMode {
  try {
    return Storage.getItemSync(MODE_KEY) === 'demo' ? 'demo' : 'real';
  } catch {
    return 'real';
  }
}

/** The demo data is rebuilt each time it opens: always the same portfolio, dated relative to today. */
async function initDemo(db: SQLiteDatabase) {
  await migrate(db);
  await db.withExclusiveTransactionAsync(resetWithDemoData);
}

interface DataModeValue {
  mode: DataMode;
  isDemo: boolean;
  /** Persists the mode and reopens the app on the other database (every screen is remounted). */
  switchTo: (mode: DataMode) => void;
}

const DataModeContext = createContext<DataModeValue | null>(null);

export function DataModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState(readMode);

  const switchTo = useCallback((next: DataMode) => {
    Storage.setItemSync(MODE_KEY, next);
    setMode(next);
  }, []);

  return (
    <DataModeContext.Provider value={{ mode, isDemo: mode === 'demo', switchTo }}>
      {/* The key remounts everything below on a switch: no state of one database leaks into the other. */}
      <SQLiteProvider key={mode} databaseName={DATABASE_NAMES[mode]} onInit={mode === 'demo' ? initDemo : migrate}>
        {children}
      </SQLiteProvider>
    </DataModeContext.Provider>
  );
}

export function useDataMode() {
  const ctx = useContext(DataModeContext);
  if (!ctx) throw new Error('useDataMode must be used inside <DataModeProvider>');
  return ctx;
}
