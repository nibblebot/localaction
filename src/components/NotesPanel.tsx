/**
 * Notes attached to an entity: a list, an "Add Note" action, and the split
 * markdown editor for the selected note (rendered by `NoteEditor`).
 */

import { useState } from 'react';
import { useRowIds } from 'tinybase/ui-react';
import {
  useDataLayer,
  createNote,
  getNote,
  COLUMNS,
  TABLES,
} from '../data/index.ts';
import type { NoteEntityType } from '../data/index.ts';
import { NoteEditor } from './NoteEditor.tsx';

export interface NotesPanelProps {
  entityType: NoteEntityType;
  entityId: string;
}

export function NotesPanel({ entityType, entityId }: NotesPanelProps): React.JSX.Element {
  const { store } = useDataLayer();
  const noteIds = useNotesForEntityReactive(store, entityType, entityId);
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = activeId ? getNote(store, activeId) : undefined;
  // Drop the active selection if the note moved to another entity.
  const effectiveActiveId =
    active && active.entityType === entityType && active.entityId === entityId
      ? active.id
      : null;

  function addNote(): void {
    const id = createNote(store, { title: 'New Note', entityType, entityId });
    setActiveId(id);
  }

  return (
    <section className="notes" aria-label="Notes">
      <header className="notes-header">
        <h3>Notes</h3>
        <button type="button" className="btn" onClick={addNote}>
          + Note
        </button>
      </header>

      {noteIds.length === 0 ? (
        <p className="placeholder">No notes attached. Click <strong>+ Note</strong> to add one.</p>
      ) : (
        <ul className="notes-list">
          {noteIds.map((id) => {
            const note = getNote(store, id);
            if (!note) return null;
            return (
              <li key={id} className={`notes-item${effectiveActiveId === id ? ' notes-item-active' : ''}`}>
                <button type="button" className="notes-item-title" onClick={() => setActiveId(id)}>
                  {note.title || 'Untitled'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {effectiveActiveId && (
        <NoteEditor key={effectiveActiveId} noteId={effectiveActiveId} onDeleted={() => setActiveId(null)} />
      )}
    </section>
  );
}

function useNotesForEntityReactive(
  store: ReturnType<typeof useDataLayer>['store'],
  entityType: NoteEntityType,
  entityId: string,
): string[] {
  const allIds = useRowIds(TABLES.notes, store);
  return allIds.filter(
    (id) =>
      store.getCell(TABLES.notes, id, COLUMNS.notes.entityType) === entityType &&
      store.getCell(TABLES.notes, id, COLUMNS.notes.entityId) === entityId,
  );
}