import { useEffect, useRef, useState } from 'react';
import {
  useDataLayer,
  useStoreVersion,
  createPerson,
} from '../../data/index.ts';
import { sortPersonIds, usePresentPersonIds } from '../../data/personSelectors.ts';
import { usePersonFilter } from './usePersonFilter.ts';
import PersonAvatar from './PersonAvatar.tsx';
import { COLUMNS, TABLES } from '../../data/schema.ts';

/**
 * Sidebar filter facet. Renders one chip per present person; clicking
 * a chip toggles its presence in the filter. Empty selection = no
 * filter. The header's + button is the single place people are
 * created — assignment to entities happens in the assignment
 * popovers, which list every present person.
 */
export default function PersonFilterFacet(): React.JSX.Element {
  const { store } = useDataLayer();
  useStoreVersion(store);
  const ids = usePresentPersonIds(store);
  const { toggle, has, clear, active } = usePersonFilter();
  const [creating, setCreating] = useState(false);

  // Self first, then by name (deterministic, sync-stable).
  const sorted = sortPersonIds(store, ids);

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
          {sorted.map((id) => {
            const name = String(
              store.getCell(TABLES.persons, id, COLUMNS.persons.name) ?? '',
            );
            const color = String(
              store.getCell(TABLES.persons, id, COLUMNS.persons.color) ?? '',
            );
            return (
              <button
                key={id}
                type="button"
                className="person-filter-chip"
                data-on={has(id) ? 'true' : 'false'}
                onClick={() => toggle(id)}
                title={name}
                aria-pressed={has(id)}
              >
                <PersonAvatar name={name} color={color} small />
                <span className="person-filter-chip-name">{name || 'Untitled'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
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
