import { useDataLayer, useStoreVersion, SELF_PERSON_ID } from '../../data/index.ts';
import { usePresentPersonIds } from '../../data/personSelectors.ts';
import { usePersonFilter } from './usePersonFilter.ts';
import PersonAvatar from './PersonAvatar.tsx';
import { COLUMNS, TABLES } from '../../data/schema.ts';

/**
 * Sidebar filter facet. Renders one chip per present person; clicking
 * a chip toggles its presence in the filter. Empty selection = no
 * filter.
 */
export default function PersonFilterFacet(): React.JSX.Element {
  const { store } = useDataLayer();
  useStoreVersion(store);
  const ids = usePresentPersonIds(store);
  const { toggle, has, clear, active } = usePersonFilter();

  // Sort Self first, then by name (deterministic, sync-stable).
  const sorted = [...ids].sort((a, b) => {
    if (a === SELF_PERSON_ID) return -1;
    if (b === SELF_PERSON_ID) return 1;
    const an = String(store.getCell(TABLES.persons, a, COLUMNS.persons.name) ?? '');
    const bn = String(store.getCell(TABLES.persons, b, COLUMNS.persons.name) ?? '');
    return an.localeCompare(bn);
  });

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
      </h2>
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