import { useMemo } from 'react';
import {
  useDataLayer,
  useArea,
  useAreaCounts,
} from '../../data/index.ts';
import { useSelection } from '../context/useSelection.ts';
import { INBOX } from '../../router.ts';
import { useShowCompleted } from '../hooks/useShowCompleted.ts';
import { useCollapsedProjects } from '../hooks/useCollapsedProjects.ts';
import { useCollapsedSections } from '../hooks/useCollapsedSections.ts';
import { useCollapsedProjectGroups } from '../hooks/useCollapsedProjectGroups.ts';
import { useHiddenEmptySections } from '../hooks/useHiddenEmptySections.ts';
import AreaHeader from './AreaHeader.tsx';
import CollapsibleSection from './CollapsibleSection.tsx';
import ProjectsSection from './ProjectsSection.tsx';
import AreaTasksSection from './AreaTasksSection.tsx';
import EmptyState from '../shared/EmptyState.tsx';
import NotesSection from '../notes/NotesSection.tsx';
import { AddNoteButton } from '../notes/NotesSection.tsx';
import { NOTES_ENABLED } from '../notes/notesConfig.ts';
import type { HeaderArea, SubAreaRef } from './types.ts';

/**
 * The selected area's main-pane view: the area header (breadcrumb,
 * edit, delete), then the Projects / Area-tasks / Notes sections, each
 * rolling in every descendant sub-area depth-first. Owns the area-only
 * view state (sub-area walk, collapse sets, completed-toggle) so the
 * dispatcher above stays a pure route switch.
 */
export default function AreaView({ areaId }: { areaId: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const counts = useAreaCounts(store);
  const area = useArea(store, areaId);

  const { showCompleted, toggle: toggleCompleted } = useShowCompleted();
  const collapsedProjects = useCollapsedProjects();
  const collapsedSections = useCollapsedSections();
  const collapsedProjectGroups = useCollapsedProjectGroups();
  const hiddenEmptySections = useHiddenEmptySections();

  const parent = useMemo<HeaderArea | null>(() => {
    if (!areaId) return null;
    const byId = new Map(counts.map((c) => [c.id, c]));
    const current = byId.get(areaId);
    const p = current?.parentId ? byId.get(current.parentId) : undefined;
    return p ? { id: p.id, name: p.name } : null;
  }, [counts, areaId]);

  // Depth-first list of every descendant area (sub-areas, recursively),
  // so the sections below can roll their content into this view.
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

  const projectCount = counts.find((c) => c.id === areaId)?.projectCount ?? 0;
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
          showCompleted={showCompleted}
          onToggleCompleted={toggleCompleted}
          onNavigate={goToArea}
          onDeleteArea={goToInbox}
        />
        <CollapsibleSection
          title="Projects"
          icon="project-list"
          count={projectCount}
          collapsed={collapsedSections.collapsed.has('projects')}
          onToggleCollapse={() => collapsedSections.toggle('projects')}
        >
          <ProjectsSection
            areaId={areaId}
            subAreas={subAreas}
            showCompleted={showCompleted}
            collapsed={collapsedProjects.collapsed}
            onToggleCollapse={collapsedProjects.toggle}
            collapsedGroups={collapsedProjectGroups.collapsed}
            onToggleGroup={collapsedProjectGroups.toggle}
            hiddenEmptySections={hiddenEmptySections.collapsed}
            onToggleEmptySections={hiddenEmptySections.toggle}
          />
        </CollapsibleSection>
        <AreaTasksSection
          areaId={areaId}
          subAreas={subAreas}
          showCompleted={showCompleted}
          collapsed={collapsedSections.collapsed.has('tasks')}
          onToggleCollapse={() => collapsedSections.toggle('tasks')}
        />
        {NOTES_ENABLED && (
          <CollapsibleSection
            title="Notes"
            icon="notes"
            count={noteCount}
            collapsed={collapsedSections.collapsed.has('notes')}
            onToggleCollapse={() => collapsedSections.toggle('notes')}
            trailing={
              <AddNoteButton
                areaId={areaId}
                onOpen={() => {
                  if (collapsedSections.collapsed.has('notes')) collapsedSections.toggle('notes');
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
