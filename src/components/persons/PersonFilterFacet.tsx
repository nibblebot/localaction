import { useEffect, useRef, useState } from 'react';
import { useTables } from 'tinybase/ui-react';
import {
  useDataLayer,
  createPerson,
  usePerson,
  SELF_PERSON_ID,
} from '../../data/index.ts';
import { sortPersonIds, usePresentPersonIds } from '../../data/personSelectors.ts';
import { usePersonFilter } from './usePersonFilter.ts';
import PersonAvatar from './PersonAvatar.tsx';
import PersonEditPopover from './PersonEditPopover.tsx';

/**
 * Sidebar filter facet. Renders one chip per present person; clicking
 * a chip toggles its presence in the filter. Empty selection = no
 * filter. The header's + button is the single place people are
 * created — assignment to entities happens in the assignment
 * popovers, which list every present person. Each chip also carries
 * a hover/focus edit affordance (rename, recolor, delete); Self is
 * renamed there too — its name is a display name, its canonical
 * identity is the fixed id.
 */
export default function PersonFilterFacet(): React.JSX.Element {
  const { store } = useDataLayer();
  const tables = useTables(store);
  const ids = usePresentPersonIds(store);
  const { toggle, has, clear, active } = usePersonFilter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAnchor, setEditAnchor] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Self first, then by name (deterministic, sync-stable). `tables`
  // is the React Compiler dep token so a rename re-sorts.
  const sorted = sortPersonIds(store, ids, tables);

  return (
    <div className="sidebar-section">
      <h2 className="sidebar-section-title">
        <span>People</span>
        {active ? (
          <button
            type="button"
            className="sidebar-section-title-action"
            onClick={clear}
            aria-label="Clear person filter"
            title="Clear filter"
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#close-icon" />
            </svg>
          </button>
        ) : null}
        <button
          type="button"
          className="sidebar-section-title-action"
          onClick={() => setCreating(true)}
          aria-label="New person"
          title="New person"
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#add-icon" />
          </svg>
        </button>
      </h2>
      {creating ? (
        <NewPersonForm
          onCancel={() => setCreating(false)}
          onCreate={(name) => {
            createPerson(store, { name });
            setCreating(false);
          }}
        />
      ) : null}
      {sorted.length === 0 ? (
        <p className="person-filter-empty">No people yet.</p>
      ) : (
        <div className="person-filter-chips">
          {sorted.map((id) => (
            <FilterChip
              key={id}
              id={id}
              selected={has(id)}
              onToggle={() => toggle(id)}
              onEdit={(anchor) => {
                setEditingId(id);
                setEditAnchor(anchor);
              }}
            />
          ))}
        </div>
      )}
      <PersonEditPopover
        anchor={editAnchor}
        personId={editingId ?? SELF_PERSON_ID}
        onClose={() => {
          setEditingId(null);
          setEditAnchor(null);
        }}
      />
    </div>
  );
}

/**
 * One filter chip: avatar + name toggle, plus a hover/focus edit
 * badge. Reads the person through `usePerson` (reactive `useRow`)
 * so a rename/recolor re-renders the chip — imperative `getCell`
 * reads here would go stale under React Compiler memoisation.
 */
function FilterChip({
  id,
  selected,
  onToggle,
  onEdit,
}: {
  id: string;
  selected: boolean;
  onToggle: () => void;
  onEdit: (anchor: { x: number; y: number }) => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const person = usePerson(store, id);
  const name = person?.name ?? '';
  const color = person?.color ?? '';
  return (
    <span className="person-filter-chip-wrap">
      <button
        type="button"
        className="person-filter-chip"
        data-on={selected ? 'true' : 'false'}
        onClick={onToggle}
        title={name}
        aria-pressed={selected}
      >
        <PersonAvatar name={name} color={color} small />
        <span className="person-filter-chip-name">{name || 'Untitled'}</span>
      </button>
      <button
        type="button"
        className="person-filter-chip-edit"
        title={`Edit ${name || 'person'}`}
        aria-label={`Edit ${name || 'person'}`}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget
            .closest('.person-filter-chip-wrap')
            ?.getBoundingClientRect();
          onEdit({ x: r ? r.right + 4 : 0, y: r ? r.top : 0 });
        }}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#edit-icon" />
        </svg>
      </button>
    </span>
  );
}

/**
 * Inline create form under the People header. Enter submits a
 * non-empty trimmed name, Escape cancels. Creating a person stores
 * no links — assignment happens per entity afterwards.
 */
function NewPersonForm({
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
      className="person-filter-new-form"
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
        className="inline-add-input inline-add-input-sm"
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
