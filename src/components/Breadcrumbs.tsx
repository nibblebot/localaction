import { useResolvedSelection } from './useBreadcrumbs.ts';
import { useSelection } from './useSelection.ts';
import type { Selection } from '../router.ts';

export default function Breadcrumbs(): React.JSX.Element {
  const { selection } = useSelection();
  const { trail } = useResolvedSelection(selection);
  const { navigate } = useSelection();

  function go(sel: Selection): void {
    navigate(sel);
  }

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumbs">
      <button type="button" className="breadcrumb-link" onClick={() => go({ kind: 'home' })}>
        Home
      </button>
      {trail.map((seg, i) => (
        <span key={`${seg.selection.kind}-${segmentKey(seg.selection)}`} className="breadcrumb-segment">
          <span className="breadcrumb-sep" aria-hidden="true">&gt;</span>
          <button
            type="button"
            className="breadcrumb-link"
            onClick={() => go(seg.selection)}
            aria-current={i === trail.length - 1 ? 'page' : undefined}
          >
            {seg.label}
          </button>
        </span>
      ))}
    </nav>
  );
}

function segmentKey(sel: Selection): string {
  switch (sel.kind) {
    case 'home':
      return 'home';
    case 'note':
      return sel.slug;
    case 'tag':
      return `tag:${sel.value}`;
    case 'domain':
    case 'project':
    case 'task':
      return sel.id;
  }
}