import { useEffect, useRef, useState } from 'react';
import { useDataLayer, useTableVersion, SELF_PERSON_ID, TABLES } from '../../data/index.ts';
import { deletePerson, getPerson, nameDerivedHue, updatePerson } from '../../data/persons.ts';
import PersonAvatar from './PersonAvatar.tsx';
import { useFocusTrap } from '../useFocusTrap.ts';

export interface PersonEditPopoverProps {
  /** Anchor for popover positioning. */
  anchor: { x: number; y: number } | null;
  personId: string;
  onClose: () => void;
}

const SWATCH_COLORS: readonly string[] = [
  '#7c5cff', // purple
  '#3b82f6', // blue
  '#22a06b', // green
  '#ec4899', // pink
  '#f59e0b', // amber
  '#9aa3ad', // gray
  '#06b6d4', // cyan
  '#ef4444', // red
];

/**
 * Tiny popover for renaming, recoloring, and deleting a single
 * person. Self is non-deletable and the delete button is disabled
 * (I6). Color is a free hex pick — the swatches are a convenience
 * for common picks, not a fixed palette.
 */
export default function PersonEditPopover({
  anchor,
  personId,
  onClose,
}: PersonEditPopoverProps): React.JSX.Element | null {
  const { store } = useDataLayer();
  // Re-read the person row if it changes while the popover is open
  // (e.g. a rename synced from another client).
  useTableVersion(store, TABLES.persons);
  const initial = getPerson(store, personId);
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? nameDerivedHue(initial?.name ?? ''));
  const rootRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(rootRef, anchor !== null);
  const isSelf = personId === SELF_PERSON_ID;

  // Re-seed the form when the popover switches to a different person
  // (the component stays mounted between opens, so useState alone
  // would keep the previous person's name). Adjust-during-render per
  // the React docs; never fires while typing because personId is
  // stable for an open editor.
  const [seededFor, setSeededFor] = useState(personId);
  if (seededFor !== personId) {
    setSeededFor(personId);
    setName(initial?.name ?? '');
    setColor(initial?.color ?? nameDerivedHue(initial?.name ?? ''));
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

  if (!anchor) return null;

  const x = Math.max(8, Math.min(anchor.x, window.innerWidth - 304));
  const y = Math.max(8, Math.min(anchor.y, window.innerHeight - 200));

  function commit(): void {
    updatePerson(store, personId, { name, color });
  }

  function onDelete(): void {
    if (isSelf) return;
    deletePerson(store, personId);
    onClose();
  }

  return (
    <>
      <div className="person-picker-backdrop" onClick={onClose} />
      <div
        ref={rootRef}
        className="person-edit"
        role="dialog"
        aria-modal="true"
        aria-label="Edit person"
        style={{ top: y, left: x }}
      >
        <div className="person-edit-row">
          <PersonAvatar name={name || '?'} color={color} small />
          <input
            type="text"
            className="person-edit-name"
            value={name}
            placeholder="Name"
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
          />
        </div>
        <div className="person-edit-color">
          {SWATCH_COLORS.map((hex) => (
            <button
              type="button"
              key={hex}
              className="person-edit-color-swatch"
              data-active={hex === color}
              style={{ background: hex }}
              onClick={() => {
                setColor(hex);
                updatePerson(store, personId, { color: hex });
              }}
              title={hex}
              aria-label={`Use color ${hex}`}
            />
          ))}
          <input
            type="color"
            className="person-edit-color-picker"
            value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#7c5cff'}
            onChange={(e) => {
              setColor(e.target.value);
              updatePerson(store, personId, { color: e.target.value });
            }}
            title="Pick a custom color"
            aria-label="Pick a custom color"
          />
        </div>
        <div className="person-edit-actions">
          <button
            type="button"
            className="person-edit-delete"
            onClick={onDelete}
            disabled={isSelf}
            title={
              isSelf
                ? 'Self cannot be deleted'
                : `Delete ${name || 'person'} (associations will fall out at read time)`
            }
          >
            Delete
          </button>
          <div className="person-edit-spacer" />
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </>
  );
}
