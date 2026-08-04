/**
 * Auto-growing single-line-looking textarea: the element collapses then
 * re-measures on every value change so it wraps at the row width instead
 * of scrolling horizontally like a single-line input, and a
 * ResizeObserver re-fits when the row width changes (window resize)
 * even though the text did not. Shared by `TaskTitleInput` (task rows)
 * and `TaskDraftRow` (the pending draft row).
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

export function useAutogrowTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
): void {
  const fitRef = useRef<() => void>(() => {});
  fitRef.current = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    fitRef.current();
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fitRef.current());
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}
