import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { UndoContext } from './undoContext.ts';
import type { UndoOffer } from './undoContext.ts';
import UndoToast from './UndoToast.tsx';

/** Time a toast stays up untouched before the undo window closes. */
const AUTO_DISMISS_MS = 6000;
/** Re-arm delay after the pointer/focus leaves a paused toast. */
const REARM_MS = 3000;

interface ActiveUndo extends UndoOffer {
  id: number;
}

/**
 * Owns the single undo toast for the app shell. Latest action wins: a new
 * offer replaces whatever is showing (its snapshot is simply dropped —
 * the deletion it guarded already stands). The auto-dismiss timer pauses
 * while the pointer or keyboard focus is inside the toast so a keyboard
 * user who tabs to Undo never has it vanish under them.
 */
export default function UndoProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [entry, setEntry] = useState<ActiveUndo | null>(null);
  const counter = useRef(0);
  const timer = useRef<NodeJS.Timeout | null>(null);

  const clearTimer = useCallback((): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const armTimer = useCallback(
    (ms: number): void => {
      clearTimer();
      timer.current = setTimeout(() => setEntry(null), ms);
    },
    [clearTimer],
  );

  useEffect(() => {
    if (entry === null) return;
    armTimer(AUTO_DISMISS_MS);
    return clearTimer;
  }, [entry, armTimer, clearTimer]);

  const offerUndo = useCallback((offer: UndoOffer): void => {
    counter.current += 1;
    setEntry({ ...offer, id: counter.current });
  }, []);

  const handleUndo = useCallback((): void => {
    // Read from state, not from a setEntry updater: updaters must stay
    // pure (StrictMode double-invokes them), and onUndo is a side effect.
    entry?.onUndo();
    setEntry(null);
  }, [entry]);

  return (
    <UndoContext.Provider value={{ offerUndo }}>
      {children}
      {entry !== null && (
        <UndoToast
          key={entry.id}
          label={entry.label}
          onUndo={handleUndo}
          onPause={clearTimer}
          onResume={() => armTimer(REARM_MS)}
        />
      )}
    </UndoContext.Provider>
  );
}
