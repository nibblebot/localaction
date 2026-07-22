import { useContext } from 'react';
import { UndoContext } from './undoContext.ts';
import type { UndoContextValue } from './undoContext.ts';

export function useUndo(): UndoContextValue {
  const value = useContext(UndoContext);
  if (!value) {
    throw new Error('useUndo must be used inside a <UndoProvider>');
  }
  return value;
}
