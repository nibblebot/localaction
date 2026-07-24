import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from './useFocusTrap.ts';
import { toIso, todayIso } from './dates.ts';

interface Anchor {
  x: number;
  y: number;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Format a date-only ISO string (`YYYY-MM-DD`) as `MM/DD` without timezone math. */
function formatDueDate(iso: string): string {
  const [, mm, dd] = iso.split('-');
  return `${mm}/${dd}`;
}

function parseIso(iso: string | null): { year: number; month: number; day: number } | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}

/** Days grid for a month: leading blanks, then 1..daysInMonth. */
function monthCells(year: number, month: number): (number | null)[] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: firstDow }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

/**
 * Entity-agnostic due-date control. Shows `MM/DD` when a due date is
 * set (calendar icon otherwise); clicking opens a monthly calendar
 * popover to pick or clear the date. `className` carries the
 * row-context action styling (`project-row-action`, `task-line-action`);
 * the generic `due-date` classes size the label variant. Data-bound
 * wrappers (project, task) supply the store reads/writes.
 */
export default function DueDateButton({
  dueDate,
  onChange,
  className,
}: {
  dueDate: string | null;
  /** Called with the picked date-only ISO string, or null on Clear. */
  onChange: (iso: string | null) => void;
  className: string;
}): React.JSX.Element {
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  return (
    <>
      <button
        type="button"
        className={`${className} due-date${dueDate ? ' due-date-set' : ''}`}
        aria-label={dueDate ? `Due ${formatDueDate(dueDate)} — change` : 'Set due date'}
        title={dueDate ? `Due ${formatDueDate(dueDate)}` : 'Set due date'}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor({ x: rect.left, y: rect.bottom + 6 });
        }}
      >
        {dueDate ? (
          <span className="due-date-label">{formatDueDate(dueDate)}</span>
        ) : (
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#calendar-icon" />
          </svg>
        )}
      </button>
      {anchor && (
        <DueDateCalendar
          anchor={anchor}
          dueDate={dueDate}
          onPick={(iso) => {
            onChange(iso);
            setAnchor(null);
          }}
          onClear={() => {
            onChange(null);
            setAnchor(null);
          }}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  );
}

/** Monthly calendar popover for picking (or clearing) a due date. */
function DueDateCalendar({
  anchor,
  dueDate,
  onPick,
  onClear,
  onClose,
}: {
  anchor: Anchor;
  dueDate: string | null;
  onPick: (iso: string) => void;
  onClear: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const initial = parseIso(dueDate);
  const now = new Date();
  const [view, setView] = useState({
    year: initial?.year ?? now.getFullYear(),
    month: initial?.month ?? now.getMonth(),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cells = useMemo(() => monthCells(view.year, view.month), [view.year, view.month]);
  const today = todayIso();

  // Clamp to the viewport using the *rendered* size — the anchor-side
  // estimate can't know padding/border, so measuring avoids overflow.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  const [pos, setPos] = useState({ top: anchor.y, left: anchor.x });
  useLayoutEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: Math.max(8, Math.min(anchor.y, window.innerHeight - rect.height - 8)),
      left: Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8)),
    });
  }, [anchor]);

  function shiftMonth(delta: number): void {
    setView((v) => {
      const next = new Date(v.year, v.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  return (
    <>
      <div
        className="due-calendar-backdrop"
        onClick={(e) => {
          // The popover renders inline inside clickable rows (project
          // row → detail pane) — keep backdrop/dialog clicks from
          // bubbling into the row's own click target.
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={dialogRef}
        className="due-calendar"
        role="dialog"
        aria-modal="true"
        aria-label="Pick due date"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="due-calendar-header">
          <button
            type="button"
            className="due-calendar-nav"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#chevron-left-icon" />
            </svg>
          </button>
          <span className="due-calendar-title" id="due-calendar-title" aria-live="polite">
            {MONTH_NAMES[view.month]} {view.year}
          </span>
          <button
            type="button"
            className="due-calendar-nav"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#chevron-right-icon" />
            </svg>
          </button>
        </div>
        <div className="due-calendar-grid" role="grid">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="due-calendar-weekday" role="columnheader">
              {d}
            </span>
          ))}
          {cells.map((day, i) =>
            day === null ? (
              <span
                key={`blank-${i}`}
                className="due-calendar-blank"
                aria-hidden="true"
              />
            ) : (
              <button
                key={day}
                type="button"
                role="gridcell"
                aria-describedby="due-calendar-title"
                className={`due-calendar-day${
                  toIso(view.year, view.month, day) === dueDate
                    ? ' due-calendar-day-selected'
                    : ''
                }${toIso(view.year, view.month, day) === today ? ' due-calendar-day-today' : ''}`}
                onClick={() => onPick(toIso(view.year, view.month, day))}
              >
                {day}
              </button>
            ),
          )}
        </div>
        <div className="due-calendar-actions">
          <button
            type="button"
            className="btn btn-sm"
            onClick={onClear}
            disabled={!dueDate}
          >
            Clear
          </button>
          <div className="due-calendar-spacer" />
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </>
  );
}
