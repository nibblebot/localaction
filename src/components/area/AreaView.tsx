import { useMemo } from 'react';
import {
  useDataLayer,
  useArea,
  useAreaCounts,
} from '../../data/index.ts';
import { useSelection } from '../context/useSelection.ts';
import { INBOX } from '../../router.ts';
import { useCollapsedPaneSections } from '../hooks/useCollapsedPaneSections.ts';
import AreaHeader from './AreaHeader.tsx';
import CollapsibleSection from './CollapsibleSection.tsx';
import RootTaskGroups from './RootTaskGroups.tsx';
import EmptyState from '../shared/EmptyState.tsx';
import NotesSection from '../notes/NotesSection.tsx';
import { AddNoteButton } from '../notes/NotesSection.tsx';
import { NOTES_ENABLED } from '../notes/notesConfig.ts';
import type { HeaderArea, SubAreaRef } from './types.ts';

/**
 * The selected area's main-pane view: the area header (breadcrumb, edit,
 * delete), then the unified root-task list (Active / Backlog / Done, with
 * sub-area slices rolled in), then the Notes section. Owns the area-only
 * view state (sub-area walk, pane-section collapse) so the dispatcher
 * above stays a pure route switch.
 */
export default function AreaView({ areaId }: { areaId: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const counts = useAreaCounts(store);
  const area = useArea(store, areaId);

  const collapsedPaneSections = useCollapsedPaneSections();

  const parent = useMemo<HeaderArea | null>(() => {
    if (!areaId) return null;
    const byId = new Map(counts.map((c) => [c.id, c]));
    const current = byId.get(areaId);
    const p = current?.parentId ? byId.get(current.parentId) : undefined;
    return p ? { id: p.id, name: p.name } : null;
  }, [counts, areaId]);

  // Depth-first list of every descendant area (sub-areas, recursively),
  // so the root-task groups and the notes section can roll their content
  // into this view.
  const subAreas = useMemo<readonly SubAreaRef[]>(() => {
    if (!areaId) return [];
    const byParent = new Map<string, typeof counts>();
    for (const c of counts) {
      if (!c.parentId) continue;
      const list = byParent.get(c.parentId) ?? [];
      list.push(c);
      byParent.set(c.parentId, list);
    }
    const out: SubAreaRef[] = [];
    const walk = (id: string): void => {
      const kids = [...(byParent.get(id) ?? [])].sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name);
      });
      for (const k of kids) {
        out.push({ id: k.id, name: k.name, color: k.color });
        walk(k.id);
      }
    };
    walk(areaId);
    return out;
  }, [counts, areaId]);

  if (!area) {
    return (
      <EmptyState
        message={
          counts.length === 0
            ? 'Create an area in the sidebar to get started.'
            : 'Pick an area from the sidebar to get started.'
        }
      />
    );
  }

  const noteCount = counts.find((c) => c.id === areaId)?.noteCount ?? 0;

  const goToArea = (id: string): void => {
    navigate({ kind: 'area', id });
  };
  const goToInbox = (): void => {
    navigate(INBOX);
  };

  return (
    <main className="main" aria-label="Editor">
      <div className="main-body">
        <AreaHeader
          areaId={areaId}
          name={area.name}
          color={area.color}
          parent={parent}
          onNavigate={goToArea}
          onDeleteArea={goToInbox}
        />
        <RootTaskGroups areaId={areaId} subAreas={subAreas} />
        {NOTES_ENABLED && (
          <CollapsibleSection
            title="Notes"
            icon="notes"
            count={noteCount}
            collapsed={collapsedPaneSections.collapsed.has('notes')}
            onToggleCollapse={() => collapsedPaneSections.toggle('notes')}
            trailing={
              <AddNoteButton
                areaId={areaId}
                onOpen={() => {
                  if (collapsedPaneSections.collapsed.has('notes')) {
                    collapsedPaneSections.toggle('notes');
                  }
                }}
              />
            }
          >
            <NotesSection areaId={areaId} />
          </CollapsibleSection>
        )}
      </div>
    </main>
  );
}