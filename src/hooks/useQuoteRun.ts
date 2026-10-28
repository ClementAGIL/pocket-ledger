import { useCallback, useEffect, useRef, useState } from 'react';

import { today } from '@/domain/dates';
import { quoteKey, REFETCH_AFTER_MINUTES, samePrice, type QuoteCandidate } from '@/domain/quotes';
import { runQuotes, type QuoteState } from '@/quotes/fetchQuotes';

type Found = Extract<QuoteState, { status: 'found' }>;

/**
 * Prices found during the last hour by identifier (`quoteKey`), kept while the app runs: reopening
 * the screen (after a cancel, or without saving) shows them again instead of asking the sources once more.
 */
const sessionFound = new Map<string, { state: Found; at: number }>();

function reusable(c: QuoteCandidate, now: number): Found | null {
  const hit = sessionFound.get(quoteKey(c));
  return hit && now - hit.at < REFETCH_AFTER_MINUTES * 60_000 ? { ...hit.state, minutesAgo: Math.floor((now - hit.at) / 60_000) } : null;
}

/** Starting state of each line: a price found this hour, or one saved online less than an hour ago. */
function initialStates(candidates: QuoteCandidate[], now: number): Record<number, QuoteState> {
  const states: Record<number, QuoteState> = {};
  for (const c of candidates) {
    const found = reusable(c, now);
    if (found) states[c.assetId] = found;
    else if (c.fetchedMinutesAgo !== null) states[c.assetId] = { status: 'recent', minutesAgo: c.fetchedMinutesAgo };
  }
  return states;
}

/**
 * One online-prices session (fetch screen): fetches `candidates` as soon as it mounts when `enabled`
 * (except the ones fetched less than an hour ago), tracks each line's state and which found prices
 * are ticked for saving. Unmounting cancels the run.
 */
export function useQuoteRun(candidates: QuoteCandidate[], enabled: boolean) {
  const [initial] = useState(() => initialStates(candidates, Date.now()));
  const [states, setStates] = useState<Record<number, QuoteState>>(initial);
  // Same price as now: nothing to save, unticked by default (it can still be ticked).
  const [excluded, setExcluded] = useState<Set<number>>(
    () =>
      new Set(
        candidates.filter((c) => {
          const s = initial[c.assetId];
          return s?.status === 'found' && samePrice(c.previousPrice, s.price);
        }).map((c) => c.assetId),
      ),
  );
  // Running from the start: the screen opens on the user's request and fetches right away.
  const [running, setRunning] = useState(() => enabled && candidates.some((c) => !initial[c.assetId]));
  const controller = useRef<AbortController | null>(null);
  const runId = useRef(0);

  /** Runs a fetch; its updates are ignored once a newer run started or the screen closed. */
  const launch = useCallback((list: QuoteCandidate[]) => {
    const id = ++runId.current;
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const previous = new Map(list.map((c) => [c.assetId, c.previousPrice]));
    const keys = new Map(list.map((c) => [c.assetId, quoteKey(c)]));
    runQuotes(list, {
      today: today(),
      signal: ctrl.signal,
      onUpdate: (assetId, state) => {
        if (runId.current !== id) return;
        setStates((prev) => ({ ...prev, [assetId]: state }));
        if (state.status !== 'found') return;
        sessionFound.set(keys.get(assetId) ?? '', { state, at: Date.now() });
        if (samePrice(previous.get(assetId) ?? null, state.price)) setExcluded((prev) => new Set(prev).add(assetId));
      },
    }).finally(() => {
      if (runId.current === id) setRunning(false);
    });
  }, []);

  useEffect(() => {
    const runs = runId;
    const current = controller;
    const list = candidates.filter((c) => !initial[c.assetId]);
    if (enabled && list.length > 0) launch(list);
    return () => {
      runs.current++;
      current.current?.abort();
    };
  }, [launch, candidates, initial, enabled]);

  const found = candidates.filter((c) => states[c.assetId]?.status === 'found');
  const failed = candidates.filter((c) => states[c.assetId]?.status === 'failed');
  const recent = candidates.filter((c) => states[c.assetId]?.status === 'recent');
  const reused = found.filter((c) => {
    const st = states[c.assetId];
    return st?.status === 'found' && st.minutesAgo !== undefined;
  });
  const toSave = found.filter((c) => !excluded.has(c.assetId));

  return {
    states,
    excluded,
    running,
    found,
    failed,
    /** Fetched online less than an hour ago and saved: left as they are unless asked again. */
    recent,
    /** Found earlier in this app session (not saved yet) and shown again: what "Fetch again" also asks. */
    reused,
    done: found.length + failed.length + recent.length,
    toSave,
    /** Failed or not fetched yet (cancelled): what "Retry" fetches again. */
    notFound: candidates.filter((c) => {
      const status = states[c.assetId]?.status;
      return status !== 'found' && status !== 'recent';
    }),
    unchangedCount: found.filter((c) => {
      const st = states[c.assetId];
      return st?.status === 'found' && samePrice(c.previousPrice, st.price);
    }).length,
    cancel: () => controller.current?.abort(),
    retry: (list: QuoteCandidate[]) => {
      setStates((prev) => ({ ...prev, ...Object.fromEntries(list.map((c) => [c.assetId, { status: 'pending' }])) }));
      setRunning(true);
      launch(list);
    },
    toggle: (assetId: number) =>
      setExcluded((prev) => {
        const next = new Set(prev);
        if (next.has(assetId)) next.delete(assetId);
        else next.add(assetId);
        return next;
      }),
    /** Ticks every found price, or unticks them all. */
    tickAll: (ticked: boolean) => setExcluded(ticked ? new Set() : new Set(found.map((c) => c.assetId))),
  };
}
