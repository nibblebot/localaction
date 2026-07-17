import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useDataLayer,
  useStoreVersion,
  COLUMNS,
  TABLES,
  SELF_PERSON_ID,
  type NoteEntityType,
} from '../../data/index.ts';
import {
  addEntityPerson,
  removeEntityPerson,
} from '../../data/personLinks.ts';
import { createPerson } from '../../data/persons.ts';
import PersonAvatar from './PersonAvatar.tsx';
import PersonEditPopover from './PersonEditPopover.tsx';
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
   * The current stored set for this entity (NOT the effective set —
   * we let Self stay implicit). Use `useEntityPersonIds`.
   */
  current: readonly string[];
  /**
   * The cast this assignment must be a subset of (D4). Used to scope
   * the picker's options.
   */
  cast: readonly string[];
  /** Header rendered above the option list, e.g. "Assign · Family". */
  title?: string;
  /** Close the popover (backdrop click + Escape). */
  onClose: () => void;
}

/**
 * Assignment popover for a single entity (area cast, project, or
 * task). D4 is shown by absence — only persons in the cast are
 * listed. Self is locked-on and tagged "default" (I7).
 */
export default function PersonAssignmentPopover({
  anchor,
  entityType,
  entityId,
  current,
  cast,
  title,
  onClose,
}: PersonAssignmentPopoverProps): React.JSX.Element | null {
  const { store } = useDataLayer();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [creating, setCreating] = useState(false);
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

  if (!anchor) return null;

  const x = Math.max(8, Math.min(anchor.x, window.innerWidth - 280));
  const y = Math.max(8, Math.min(anchor.y, window.innerHeight - 240));

  function toggle(personId: string): void {
    if (personId === SELF_PERSON_ID) return; // Self always in cast
    if (selectedSet.has(personId)) {
      removeEntityPerson(store, entityType, entityId, personId);
    } else {
      addEntityPerson(store, entityType, entityId, personId);
    }
  }

  async function createAndAdd(name: string): Promise<void> {
    const id = createPerson(store, { name });
    setCreating(false);
    addEntityPerson(store, entityType, entityId, id);
  }

  return (
    <>
      <div className="person-picker-backdrop" onClick={onClose} />
      <div
        ref={rootRef}
        className="person-picker"
        role="dialog"
        aria-label="Assign persons"
        style={{ top: y, left: x }}
      >
        {title && <div className="person-picker-title">{title}</div>}
        {cast.map((pid) => (
          <PersonRow
            key={pid}
            personId={pid}
            isSelf={pid === SELF_PERSON_ID}
            selected={pid === SELF_PERSON_ID || selectedSet.has(pid)}
            locked={pid === SELF_PERSON_ID}
            onToggle={() => toggle(pid)}
            onEdit={() => {
              setEditingPersonId(pid);
              const r = rootRef.current?.getBoundingClientRect();
              setEditAnchor({ x: r ? r.right + 4 : 0, y: r ? r.top : 0 });
            }}
          />
        ))}
        {creating ? (
          <NewPersonRow
            onCancel={() => setCreating(false)}
            onCreate={createAndAdd}
          />
        ) : (
          <button
            type="button"
            className="person-picker-new"
            onClick={() => setCreating(true)}
          >
            + New person
          </button>
        )}
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
  onToggle,
  onEdit,
}: {
  personId: string;
  isSelf: boolean;
  selected: boolean;
  locked: boolean;
  onToggle: () => void;
  onEdit: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  useStoreVersion(store);
  const name = String(
    store.getCell(TABLES.persons, personId, COLUMNS.persons.name) ?? '',
  );
  const color = String(
    store.getCell(TABLES.persons, personId, COLUMNS.persons.color) ?? '',
  );
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

function NewPersonRow({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (name: string) => void;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <form
      className="person-picker-row"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        onCreate(trimmed);
      }}
    >
      <input
        ref={inputRef}
        type="text"
        className="person-edit-name"
        value={name}
        placeholder="Person name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}
