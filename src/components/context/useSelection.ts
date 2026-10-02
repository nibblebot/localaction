import { useContext } from 'react';
import { SelectionContext, type SelectionContextValue } from './selectionContext.ts';

export function useSelection(): SelectionContextValue {
  const value = useContext(SelectionContext);
  if (!value) {
    throw new Error('useSelection must be used inside a <SelectionProvider>');
  }
  return value;
}
