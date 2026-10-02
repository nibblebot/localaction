import { useCallback, useEffect, useRef } from 'react';
import { SIDEBAR_MAX_PX, SIDEBAR_MIN_PX, useSidebarWidth } from './useSidebarWidth.ts';

interface DragState {
  /** Pointer X at the time of pointerdown. */
  startX: number;
  /** Sidebar width at the time of pointerdown. */
  startWidth: number;
}

/**
 * Drag handle pinned to the inline-end edge of the sidebar. Drag
 * horizontally to grow the sidebar up to SIDEBAR_MAX_PX; keyboard
 * arrow keys also resize (Up/Right grows, Down/Left shrinks, with
 * Page Up/Down for a larger step). Pure view state, not data — the
 * width is persisted to localStorage by the useSidebarWidth hook.
 *
 * During a drag, the CSS variable is written directly on every move
 * event (no React state, no re-render). On pointerup the new value is
 * committed once via setWidth, which persists and re-renders the
 * committed value into React.
 */
export default function SidebarResizer(): React.JSX.Element {
  const { width, min, max, setWidth, applyTransientWidth } = useSidebarWidth();
  const dragRef = useRef<DragState | null>(null);

  // Listen at the window level so a fast drag past the handle's
  // bounding box still tracks. The native pointer capture API keeps
  // the events flowing even if the cursor leaves the handle.
  useEffect(() => {
    function onMove(e: PointerEvent): void {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      applyTransientWidth(d.startWidth + (e.clientX - d.startX));
    }
    function onUp(): void {
      const d = dragRef.current;
      if (!d) return;
      // Read the live value back from the CSS var so the commit
      // matches what the user actually saw, not the next event's
      // guess. Cheap, idempotent.
      const live = readSidebarWidthFromRoot() ?? d.startWidth;
      dragRef.current = null;
      document.body.classList.remove('sidebar-resizing');
      setWidth(live);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [applyTransientWidth, setWidth]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      // Left button only. Buttons like middle-click should not engage
      // the resize.
      if (e.button !== 0) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: width };
      document.body.classList.add('sidebar-resizing');
      // Pointer capture keeps pointermove flowing to this element even
      // if the cursor leaves the handle.
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [width],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      const step = e.shiftKey ? 16 : 4;
      let next: number | null = null;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          next = width + step;
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          next = width - step;
          break;
        case 'PageUp':
          next = width + 16;
          break;
        case 'PageDown':
          next = width - 16;
          break;
        case 'Home':
          next = SIDEBAR_MIN_PX;
          break;
        case 'End':
          next = SIDEBAR_MAX_PX;
          break;
        default:
          return;
      }
      e.preventDefault();
      setWidth(next);
    },
    [setWidth, width],
  );

  return (
    <div
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

function readSidebarWidthFromRoot(): number | null {
  if (typeof document === 'undefined') return null;
  const v = document.documentElement.style.getPropertyValue('--sidebar-w');
  if (!v) return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
