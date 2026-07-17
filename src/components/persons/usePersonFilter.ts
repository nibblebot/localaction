import { useContext } from 'react';
import {
  PersonFilterContext,
  type PersonFilterValue,
} from './personFilterContextValue.ts';

export function usePersonFilter(): PersonFilterValue {
  const v = useContext(PersonFilterContext);
  if (!v) {
    throw new Error('usePersonFilter must be used inside <PersonFilterProvider>');
  }
  return v;
}
