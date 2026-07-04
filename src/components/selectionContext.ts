/**
 * React context for the app's `Selection` (the entity / deep-link the user is
 * looking at). Lives in its own file so `selection.tsx` can export only the
 * `SelectionProvider` component — keeps `react/only-export-components` clean
 * for fast-refresh.
 */

import { createContext } from 'react';
import type { Selection } from '../router.ts';

export interface SelectionContextValue {
  selection: Selection;
  navigate: (sel: Selection) => void;
}

export const SelectionContext = createContext<SelectionContextValue | undefined>(undefined);