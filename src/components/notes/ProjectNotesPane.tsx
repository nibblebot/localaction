import { useEffect, useRef, useState } from 'react';
import {
  useDataLayer,
  useProject,
  createNote,
  NOTE_ENTITY_TYPE,
} from '../../data/index.ts';
import ProjectPaneHeader from '../projects/ProjectPaneHeader.tsx';
import InlineAddInput from '../shared/InlineAddInput.tsx';
import EmptyState from '../shared/EmptyState.tsx';
import { NoteLine } from './NotesSection.tsx';
import { collectNoteIds } from './note-helpers.ts';
import { useFocusEmptyList } from '../hooks/useFocusEmptyList.ts';

export default function ProjectNotesPane({ projectId }: { projectId: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const project = useProject(store, projectId);
  const [noteIds, setNoteIds] = useState<string[]>(() => {
    const ids: string[] = [];
    collectNoteIds(store, projectId, ids);
    return ids;
  });
  useEffect(() => {
    const refresh = (): void => {
      const ids: string[] = [];
      collectNoteIds(store, projectId, ids);
      setNoteIds(ids);
    };
    refresh();
    const listenerId = store.addDidFinishTransactionListener(refresh);
    return () => {
      store.delListener(listenerId);
    };
  }, [store, projectId]);

  function addNote(title: string): void {
    createNote(store, {
      title,
      body: '',
      entityType: NOTE_ENTITY_TYPE.project,
      entityId: projectId,
    });
  }

  const addInputRef = useRef<HTMLInputElement>(null);
  useFocusEmptyList(addInputRef, noteIds.length === 0);

  if (!project) {
    return <EmptyState message="This project no longer exists." />;
  }

  return (
    <main className="main" aria-label="Editor">
      <div className="main-body">
        <ProjectPaneHeader
          areaId={project.areaId}
          projectId={projectId}
          name={project.name || 'Untitled'}
        />
        <section className="notes-tab" aria-label="Notes">
          <ul className="notes-tab-list" role="list">
            {noteIds.map((nid) => (
              <NoteLine key={nid} noteId={nid} />
            ))}
          </ul>
          <InlineAddInput
            ref={addInputRef}
            placeholder={
              noteIds.length === 0
                ? 'No notes yet — add the first one.'
                : 'New note…'
            }
            ariaLabel="New note"
            onSubmit={addNote}
          />
        </section>
      </div>
    </main>
  );
}
