import { useEffect } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open traps, bottom → top. Only the topmost trap handles Tab, so
 * nested overlays (e.g. a popover opened from another popover) don't
 * fight each other. */
const trapStack: HTMLElement[] = [];

/**
 * Modal/popover focus containment (DESIGN.md: "the keyboard is a
 * first-class surface"). While `active`, Tab / Shift+Tab cycle inside
 * the container instead of escaping into the page behind it; on close,
 * focus returns to the element that opened the overlay.
 *
 * The hook does not steal focus on open — callers keep their own
 * autofocus — it only prevents focus from *leaving* the container.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    trapStack.push(container);

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      if (trapStack[trapStack.length - 1] !== container) return;
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !container.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const i = trapStack.indexOf(container);
      if (i >= 0) trapStack.splice(i, 1);
      previouslyFocused?.focus();
    };
  }, [ref, active]);
}
