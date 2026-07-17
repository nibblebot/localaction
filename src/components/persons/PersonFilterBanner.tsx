import { useDataLayer, useStoreVersion, TABLES, COLUMNS } from '../../data/index.ts';
import { usePersonFilter } from './usePersonFilter.ts';

/**
 * Banner over MainPane when a person filter is active. Lists the
 * selected persons by name and offers a one-click Clear.
 */
export default function PersonFilterBanner(): React.JSX.Element | null {
  const { store } = useDataLayer();
  useStoreVersion(store);
  const { active, selected, clear } = usePersonFilter();
  if (!active) return null;
  const names = selected
    .map((id) => String(store.getCell(TABLES.persons, id, COLUMNS.persons.name) ?? ''))
    .filter((s) => s.length > 0);
  // If the only selection is Self, label as "Self" — avoid the
  // confusing "Self" render. Always include Self by id if present.
  const display = names.length > 0 ? names.join(', ') : 'Self';
  return (
    <div className="person-filter-banner" role="status" aria-live="polite">
      <div className="person-filter-banner-text">
        Filtering by <b>{display}</b>
      </div>
      <button
        type="button"
        className="person-filter-banner-clear"
        onClick={clear}
        title="Clear filter"
      >
        Clear
      </button>
    </div>
  );
}
