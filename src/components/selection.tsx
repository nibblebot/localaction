/**
 * Selection state and hash-router glue.
 *
 * The `Selection` (from `src/router.ts`) is the single source of truth for
 * "what is the user looking at". The `SelectionProvider` keeps it in sync
 * with `window.location.hash`:
 *
 *   • On mount, parse the current hash into a Selection.
 *   • On `navigate(sel)`, set the hash (which fires `hashchange`).
 *   • On `hashchange` (back/forward, or our own set), re-parse and update.
 *
 * `navigate` writes the hash rather than mutating state directly, so there's
 * exactly one code path (the `hashchange` listener) that updates state — no
 * risk of state/hash drift, and browser history Just Works.
 *
 * Note (issue 11): selecting an entity updates the URL once per *committed*
 * selection (a click), not per keystroke, because title editing never calls
 * `navigate`.
 *
 * The context lives in `selectionContext.ts` and the `useSelection` hook in
 * `useSelection.ts` — this file exports only the provider component.
 */

import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  formatRoute,
  parseRoute,
  routeEquals,
} from '../router.ts';
import type { Selection } from '../router.ts';
import { SelectionContext } from './selectionContext.ts';

export function SelectionProvider({ children }: { children: ReactNode }): ReactElement {
  const [selection, setSelection] = useState<Selection>(() =>
    parseRoute(typeof window === 'undefined' ? '' : window.location.hash),
  );

  useEffect(() => {
    const onHashChange = (): void => {
      setSelection(parseRoute(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((sel: Selection): void => {
    const next = formatRoute(sel);
    if (next === window.location.hash) {
      // Same hash — still ensure state matches (e.g. initial load).
      setSelection((prev) => (routeEquals(prev, sel) ? prev : sel));
      return;
    }
    // Setting the hash fires `hashchange`, which updates state.
    window.location.hash = next;
  }, []);

  return (
    <SelectionContext.Provider value={{ selection, navigate }}>
      {children}
    </SelectionContext.Provider>
  );
}