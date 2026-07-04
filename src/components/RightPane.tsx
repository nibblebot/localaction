/**
 * Right pane: breadcrumbs + sync status, then the editor for the focused
 * entity. When the selection resolves to nothing (home, or a stale deep
 * link), show an empty state.
 */

import { useDataLayer } from '../data/index.ts';
import type { SyncStatus } from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import { useResolvedSelection } from './useBreadcrumbs.ts';
import { Breadcrumbs } from './Breadcrumbs.tsx';
import { DomainEditor } from './DomainEditor.tsx';
import { ProjectEditor } from './ProjectEditor.tsx';
import { TaskDetail } from './TaskDetail.tsx';
import { NoteEditor } from './NoteEditor.tsx';
import { useNoteIdForSlug } from './noteHooks.ts';

function SyncStatusBadge(): React.JSX.Element {
  const { syncStatus } = useDataLayer();
  return (
    <div className={`sync-status sync-status-${syncStatus.kind}`} role="status">
      {labelFor(syncStatus)}
    </div>
  );
}

function labelFor(status: SyncStatus): string {
  switch (status.kind) {
    case 'idle':
      return 'Sync: idle';
    case 'connecting':
      return 'Sync: connecting…';
    case 'connected':
      return 'Sync: connected';
    case 'retrying':
      return `Sync: retry #${status.attempt} in ${Math.round(status.nextDelayMs)}ms (${status.reason})`;
    case 'error':
      return `Sync: error — ${status.message}`;
  }
}

export function RightPane(): React.JSX.Element {
  const { selection } = useSelection();
  const { focus } = useResolvedSelection(selection);
  const noteId = useNoteIdForSlug(focus?.kind === 'note' ? focus.slug : undefined);

  return (
    <main className="pane pane-right" aria-label="Editor">
      <header className="pane-header">
        <Breadcrumbs />
        <SyncStatusBadge />
      </header>
      <div className="pane-body">
        {!focus && <EmptyState />}
        {focus?.kind === 'domain' && <DomainEditor id={focus.id} />}
        {focus?.kind === 'project' && <ProjectEditor id={focus.id} />}
        {focus?.kind === 'task' && <TaskDetail id={focus.id} />}
        {focus?.kind === 'note' && noteId && <NoteEditor noteId={noteId} />}
        {focus?.kind === 'note' && !noteId && <MissingNoteState slug={focus.slug} />}
      </div>
    </main>
  );
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="empty-state">
      <h2>Welcome to LocalAction</h2>
      <p className="placeholder">
        Select a domain, project, or task from the tree — or create a new domain to get started.
      </p>
    </div>
  );
}

function MissingNoteState({ slug }: { slug: string }): React.JSX.Element {
  const { navigate } = useSelection();
  return (
    <div className="empty-state">
      <h2>Note not found</h2>
      <p className="placeholder">
        No note with slug <code>{slug}</code>.{' '}
        <button type="button" className="link-button" onClick={() => navigate({ kind: 'home' })}>
          Go home
        </button>
      </p>
    </div>
  );
}