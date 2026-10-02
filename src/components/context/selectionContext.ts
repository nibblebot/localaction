import { createContext } from 'react';
import type { Selection } from '../../router.ts';

export interface SelectionContextValue {
  selection: Selection;
  navigate: (sel: Selection) => void;
}

export const SelectionContext = createContext<SelectionContextValue | undefined>(undefined);
