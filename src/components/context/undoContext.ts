import { createContext } from 'react';

export interface UndoOffer {
  /** Plain past-tense label, e.g. `Deleted “Q3 roadmap”`. */
  label: string;
  /** Reverses the action. Called at most once, while the toast is up. */
  onUndo: () => void;
}

export interface UndoContextValue {
  /** Show an undo toast. A new offer replaces any toast already showing. */
  offerUndo: (offer: UndoOffer) => void;
}

export const UndoContext = createContext<UndoContextValue | undefined>(undefined);
