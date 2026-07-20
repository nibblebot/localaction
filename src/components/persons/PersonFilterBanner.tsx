import { useTables } from 'tinybase/ui-react';
import { useDataLayer, TABLES, COLUMNS, SELF_PERSON_ID } from '../../data/index.ts';
import { usePersonFilter } from './usePersonFilter.ts';

/**
 * Banner over MainPane when a person filter is active. Lists the
 * selected persons by name and offers a one-click Clear. Names are
 * read from the `useTables` snapshot so a rename re-renders the
 * banner (imperative `getCell` reads would go stale under React
 * Compiler memoisation).
 */
export default function PersonFilterBanner(): React.JSX.Element | null {
  const { store } = useDataLayer();
  const tables = useTables(store);
  const { active, selected, clear } = usePersonFilter();
  if (!active) return null;
  const nameOf = (id: string): string =>
    String(tables[TABLES.persons]?.[id]?.[COLUMNS.persons.name] ?? '');
  const names = selected.map(nameOf).filter((s) => s.length > 0);
  // Fallback when the selected ids have no readable name (e.g. a
  // deleted person lingering in the persisted selection): Self's
  // current display name — renamed Self included.
  const display = names.length > 0 ? names.join(', ') : nameOf(SELF_PERSON_ID) || 'Self';
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
