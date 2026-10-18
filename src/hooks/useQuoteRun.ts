import { useCallback, useEffect, useRef, useState } from 'react';

import { today } from '@/domain/dates';
import { samePrice, type QuoteCandidate } from '@/domain/quotes';
import { runQuotes, type QuoteState } from '@/quotes/fetchQuotes';

/**
 * One online-prices session (fetch screen): fetches `candidates` as soon as it mounts when `enabled`,
 * tracks each line's state and which found prices are ticked for saving. Unmounting cancels the run.
 */
export function useQuoteRun(candidates: QuoteCandidate[], enabled: boolean) {
  const [states, setStates] = useState<Record<number, QuoteState>>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  // Running from the start: the screen opens on the user's request and fetches right away.
  const [running, setRunning] = useState(enabled && candidates.length > 0);
  const controller = useRef<AbortController | null>(null);
  const runId = useRef(0);

  /** Runs a fetch; its updates are ignored once a newer run started or the screen closed. */
  const launch = useCallback((list: QuoteCandidate[]) => {
    const id = ++runId.current;
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const previous = new Map(list.map((c) => [c.assetId, c.previousPrice]));
    runQuotes(list, {
      today: today(),
      signal: ctrl.signal,
      onUpdate: (assetId, state) => {
        if (runId.current !== id) return;
        setStates((prev) => ({ ...prev, [assetId]: state }));
        // Same price as now: nothing to save, unticked by default (it can still be ticked).
        if (state.status === 'found' && samePrice(previous.get(assetId) ?? null, state.price)) {
          setExcluded((prev) => new Set(prev).add(assetId));
        }
      },
    }).finally(() => {
      if (runId.current === id) setRunning(false);
    });
  }, []);

  useEffect(() => {
    const runs = runId;
    const current = controller;
    if (enabled && candidates.length > 0) launch(candidates);
    return () => {
      runs.current++;
      current.current?.abort();
    };
  }, [launch, candidates, enabled]);

  const found = candidates.filter((c) => states[c.assetId]?.status === 'found');
  const failed = candidates.filter((c) => states[c.assetId]?.status === 'failed');
  const toSave = found.filter((c) => !excluded.has(c.assetId));

  return {
    states,
    excluded,
    running,
    found,
    failed,
    done: found.length + failed.length,
    toSave,
    /** Failed or not fetched yet (cancelled): what "Retry" fetches again. */
    notFound: candidates.filter((c) => states[c.assetId]?.status !== 'found'),
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
