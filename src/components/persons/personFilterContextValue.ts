import { createContext } from 'react';

export interface PersonFilterValue {
  /** Active filter: a list of person ids. Empty = no filter. */
  readonly selected: readonly string[];
  /** True when the filter is non-empty. */
  readonly active: boolean;
  /** Add `personId` to the filter. Idempotent. */
  toggle: (personId: string) => void;
  /** Replace the filter with `ids`. */
  setFilter: (ids: readonly string[]) => void;
  /** Drop every selected person — equivalent to "no filter". */
  clear: () => void;
  /** True if `personId` is in the filter set. */
  has: (personId: string) => boolean;
}

export const PersonFilterContext = createContext<PersonFilterValue | null>(null);
