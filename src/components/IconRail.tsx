import { useDataLayer, useDomains, useStoreVersion } from '../data/index.ts';
import { useSelection } from './useSelection.ts';

interface RailEntry {
  id: string;
  label: string;
  icon: string;
}

const ENTRIES: RailEntry[] = [
  { id: 'domains', label: 'Domains', icon: 'domains-icon' },
  { id: 'projects', label: 'Projects', icon: 'project-icon' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks-icon' },
  { id: 'notes', label: 'Notes', icon: 'notes-icon' },
];

export default function IconRail(): React.JSX.Element {
  return (
    <nav className="rail" aria-label="Primary">
      <RailBrandLink />

      {ENTRIES.map((entry) => (
        <RailNavButton key={entry.id} entry={entry} />
      ))}

      <span className="rail-spacer" />

      <button
        type="button"
        className="rail-item"
        aria-label="Settings"
        title="Settings"
        disabled
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#settings-icon" />
        </svg>
      </button>
    </nav>
  );
}

function RailBrandLink(): React.JSX.Element {
  const { navigate } = useSelection();
  const { store } = useDataLayer();
  const rootIds = useDomains(store);
  useStoreVersion(store);
  const target = rootIds[0];
  return (
    <a
      className="rail-brand"
      href={target ? `#/d/${target}` : '#/'}
      aria-label="LocalAction"
      onClick={(e) => {
        if (!target) return;
        e.preventDefault();
        navigate({ kind: 'domain', id: target });
      }}
    >
      <svg className="svg-icon" style={{ width: 22, height: 22 }} aria-hidden="true">
        <use href="/icons.svg#memos-mark-icon" />
      </svg>
    </a>
  );
}

function RailNavButton({ entry }: { entry: RailEntry }): React.JSX.Element {
  const { navigate } = useSelection();
  const { store } = useDataLayer();
  const rootIds = useDomains(store);
  useStoreVersion(store);
  const target = rootIds[0];
  const handle = (): void => {
    if (!target) return;
    navigate({ kind: 'domain', id: target });
  };
  return (
    <button
      type="button"
      className="rail-item"
      aria-label={entry.label}
      title={entry.label}
      disabled={!target}
      onClick={handle}
    >
      <svg className="svg-icon" aria-hidden="true">
        <use href={`/icons.svg#${entry.icon}`} />
      </svg>
    </button>
  );
}
