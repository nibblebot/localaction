/**
 * Long-press "arming" feedback for touch drag rows.
 *
 * The dnd-kit TouchSensor activates after a 250ms delay with an 8px
 * movement tolerance. This module mirrors that clock in the DOM so the
 * user sees the row wake up while the sensor is still deciding:
 *
 * - touchstart on a sortable row adds `.arming` (the CSS wash animation
 *   runs on the same 250ms clock);
 * - moving past 8px (scroll intent) or a second finger cancels, exactly
 *   like the sensor's tolerance / multi-touch rules;
 * - touchend / touchcancel always clears.
 *
 * Why not `:active`? iOS applies it to touch only inconsistently, and
 * headless-Chromium touch emulation never sets it — the feedback would
 * exist nowhere we can test. A delegated class works everywhere and is
 * verifiable in the same emulated environment as the drag itself.
 *
 * No React state: the class flip is layout-local and cheaper than
 * re-rendering every row on each press.
 */

/** Matches TouchSensor's activationConstraint.tolerance in the three
 * DndContexts (SortableList / SortableTree / ProjectStatusGroups). */
const TOLERANCE_PX = 8;

const coarsePointer = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

/** Installs the delegated listeners; returns a teardown (tests, HMR). */
export function installLongPressArming(): () => void {
  let armed: Element | null = null;
  let startX = 0;
  let startY = 0;

  const disarm = (): void => {
    armed?.classList.remove('arming');
    armed = null;
  };

  const onTouchStart = (event: TouchEvent): void => {
    if (!coarsePointer() || event.touches.length !== 1) {
      disarm();
      return;
    }
    const target = event.target instanceof Element ? event.target.closest('.sortable-row') : null;
    disarm();
    if (target) {
      const touch = event.touches[0]!; // The touch count above is exactly one.
      startX = touch.clientX;
      startY = touch.clientY;
      armed = target;
      armed.classList.add('arming');
    }
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (!armed || event.touches.length !== 1) return;
    const touch = event.touches[0]!; // The touch count above is exactly one.
    if (
      Math.abs(touch.clientX - startX) > TOLERANCE_PX ||
      Math.abs(touch.clientY - startY) > TOLERANCE_PX
    ) {
      disarm();
    }
  };

  const onTouchEnd = (): void => disarm();

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });
  return () => {
    disarm();
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('touchcancel', onTouchEnd);
  };
}
