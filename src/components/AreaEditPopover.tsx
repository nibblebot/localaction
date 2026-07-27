import { useEffect, useRef, useState } from 'react';
import {
  useDataLayer,
  updateArea,
  AREA_COLORS,
  areaColorHex,
} from '../data/index.ts';
import type { AreaColorId } from '../data/index.ts';
import { useFocusTrap } from './useFocusTrap.ts';

export interface AreaEditPopoverProps {
  /** Anchor for popover positioning. */
  anchor: { x: number; y: number } | null;
  areaId: string;
  name: string;
  color: AreaColorId;
  onClose: () => void;
  /**
   * Click handler for the in-popover delete button. The header owns
   * the confirm modal, snapshot, and undo wiring; the popover only
   * asks for a delete.
   */
  onRequestDelete: () => void;
}

/**
 * Tiny popover for renaming and recoloring an area (or sub-area),
 * opened from the main-pane area header. The name commits on
 * blur/Enter; a color swatch commits immediately. Delete lives in
 * the popover too; the header still owns the confirm modal that
 * gates it.
 */

export default function AreaEditPopover({
  anchor,
  areaId,
  name,
  color,
  onClose,
  onRequestDelete,
}: AreaEditPopoverProps): React.JSX.Element | null {
  const { store } = useDataLayer();
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, anchor !== null);

  // Re-seed the draft when the popover switches to a different area.
  // Adjust-during-render per the React docs; never fires while typing
  // because areaId is stable for an open editor.
  const [seededFor, setSeededFor] = useState(areaId);
  if (seededFor !== areaId) {
    setSeededFor(areaId);
    setDraft(name);
  }

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anchor, onClose]);

  useEffect(() => {
    if (!anchor) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [anchor]);

  if (!anchor) return null;

  const x = Math.max(8, Math.min(anchor.x, window.innerWidth - 304));
  const y = Math.max(8, Math.min(anchor.y, window.innerHeight - 200));

  function commitName(): void {
    const next = draft.trim();
    if (next && next !== name) updateArea(store, areaId, { name: next });
    else setDraft(name);
  }

  return (
    <>
      <div className="area-edit-backdrop" onClick={onClose} />
      <div
        ref={dialogRef}
        className="area-edit"
        role="dialog"
        aria-modal="true"
        aria-label="Edit area"
        style={{ top: y, left: x }}
      >
        <div className="area-edit-row">
          <span
            className="area-edit-dot"
            style={{ background: areaColorHex(color) }}
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            className="area-edit-name"
            value={draft}
            placeholder="Area name"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitName();
                e.currentTarget.blur();
              }
            }}
            aria-label="Area name"
          />
        </div>
        <div className="area-edit-colors">
          {AREA_COLORS.map((c) => (
            <button
              type="button"
              key={c.id}
              className="area-edit-color-swatch"
              data-active={c.id === color}
              style={{ background: c.hex }}
              onClick={() => updateArea(store, areaId, { color: c.id })}
              title={c.label}
              aria-label={`Use color ${c.label}`}
            />
          ))}
        </div>
        <div className="area-edit-footer">
          <button
            type="button"
            className="area-edit-delete"
            onClick={onRequestDelete}
            aria-label="Delete area"
            title="Delete area"
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#trash-icon" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
