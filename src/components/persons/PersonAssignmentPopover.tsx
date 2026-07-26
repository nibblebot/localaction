import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useDataLayer,
  useTableVersion,
  SELF_PERSON_ID,
  TABLES,
  type NoteEntityType,
} from '../../data/index.ts';
import {
  addEntityPerson,
  removeEntityPerson,
} from '../../data/personLinks.ts';
import {
  sortPersonIds,
  usePresentPersonIds,
} from '../../data/personSelectors.ts';
import { usePerson } from '../../data/persons.ts';
import PersonAvatar from './PersonAvatar.tsx';
import PersonEditPopover from './PersonEditPopover.tsx';
import { useFocusTrap } from '../useFocusTrap.ts';
export interface PersonAssignmentPopoverProps {
  /** Anchor for popover positioning. */
  anchor: { x: number; y: number } | null;
  /**
   * The entity whose persons we're editing. `entityType` is one of
   * area|project|task (re-using `NOTE_ENTITY_TYPE` for the polymorphic
   * link table).
   */
  entityType: NoteEntityType;
  entityId: string;
  /**
   * The current stored set for this entity (NOT the derived set —
   * we let Self stay implicit). Use `useEntityPersonIds`.
   */
  current: readonly string[];
  /** Header rendered above the option list, e.g. "Assign · Family". */
  title?: string;
  /** Close the popover (backdrop click + Escape). */
  onClose: () => void;
}

/**
 * Assignment popover for a single entity (area cast, project, or
 * task). Lists every present person — people are created from the
 * sidebar's People facet, not here — and toggling a row links or
 * unlinks that person. Self is locked-on and tagged "default" (I7).
 */
export default function PersonAssignmentPopover({
  anchor,
  entityType,
  entityId,
  current,
  title,
  onClose,
}: PersonAssignmentPopoverProps): React.JSX.Element | null {
  const { store } = useDataLayer();
  const personsV = useTableVersion(store, TABLES.persons) + useTableVersion(store, TABLES.person_links);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(rootRef, anchor !== null);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  // Anchor for the edit popover, placed next to the row that was clicked.
  const [editAnchor, setEditAnchor] = useState<{ x: number; y: number } | null>(
    null,
  );

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

  const selectedSet = useMemo(() => new Set(current), [current]);
  // Candidate set: every present person. Any person may be assigned
  // to any entity — there is no hierarchical narrowing. `personsV`
  // is the React Compiler dep token so a rename re-sorts.
  const everyone = sortPersonIds(store, usePresentPersonIds(store), personsV);

  if (!anchor) return null;

  const x = Math.max(8, Math.min(anchor.x, window.innerWidth - 280));
  const y = Math.max(8, Math.min(anchor.y, window.innerHeight - 240));

  function toggle(personId: string): void {
    if (personId === SELF_PERSON_ID) return; // Self always assigned
    if (selectedSet.has(personId)) {
      removeEntityPerson(store, entityType, entityId, personId);
    } else {
      addEntityPerson(store, entityType, entityId, personId);
    }
  }

  return (
    <>
      <div
        className="person-picker-backdrop"
        onClick={(e) => {
          // Rendered inline inside clickable rows (project row →
          // detail pane) — don't let backdrop/dialog clicks bubble
          // into the row's own click target.
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={rootRef}
        className="person-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Assign persons"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <div className="person-picker-title">{title}</div>}
        {everyone.map((pid) => (
          <PersonRow
            key={pid}
            personId={pid}
            isSelf={pid === SELF_PERSON_ID}
            selected={pid === SELF_PERSON_ID || selectedSet.has(pid)}
            locked={pid === SELF_PERSON_ID}
            onToggle={() => toggle(pid)}
            editExpanded={editingPersonId === pid && editAnchor !== null}
            onEdit={() => {
              setEditingPersonId(pid);
              const r = rootRef.current?.getBoundingClientRect();
              setEditAnchor({ x: r ? r.right + 4 : 0, y: r ? r.top : 0 });
            }}
          />
        ))}
      </div>
      <PersonEditPopover
        anchor={editAnchor}
        personId={editingPersonId ?? SELF_PERSON_ID}
        onClose={() => {
          setEditingPersonId(null);
          setEditAnchor(null);
        }}
      />
    </>
  );
}

function PersonRow({
  personId,
  isSelf,
  selected,
  locked,
  editExpanded,
  onToggle,
  onEdit,
}: {
  personId: string;
  isSelf: boolean;
  selected: boolean;
  locked: boolean;
  editExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  // Reactive read (`useRow`) — imperative `getCell` here would go
  // stale under React Compiler memoisation after a rename/recolor.
  const person = usePerson(store, personId);
  const name = person?.name ?? '';
  const color = person?.color ?? '';
  return (
    <label
      className={`person-picker-row${locked ? ' person-picker-row-locked' : ''}`}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={locked}
        onChange={onToggle}
      />
      <PersonAvatar name={name} color={color} small />
      <span>{name || 'Untitled'}</span>
      {isSelf && <span className="person-picker-row-note">default</span>}
      <button
        type="button"
        className="person-picker-row-edit"
        title="Edit person"
        aria-label="Edit person"
        aria-haspopup="dialog"
        aria-expanded={editExpanded}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onEdit();
        }}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#edit-icon" />
        </svg>
      </button>
    </label>
  );
}
