import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Focuses an add-input when its list is — or just was — empty, so the
 * keyboard user lands back on the creation affordance after adding the
 * first item (and on first paint of an empty list). `isEmpty` is the
 * list's empty signal; the effect re-runs whenever it flips.
 */
export function useFocusEmptyList(ref: RefObject<HTMLInputElement | null>, isEmpty: boolean): void {
  const wasEmpty = useRef(isEmpty);
  useEffect(() => {
    if (isEmpty || wasEmpty.current) ref.current?.focus();
    wasEmpty.current = isEmpty;
  }, [isEmpty, ref]);
}
