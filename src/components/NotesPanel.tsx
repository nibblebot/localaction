import { useState } from 'react';
import {
  useDataLayer,
  createNote,
  getNote,
  useNotesForEntity,
} from '../data/index.ts';
import type { NoteEntityType } from '../data/index.ts';
import NoteEditor from './NoteEditor.tsx';

export interface NotesPanelProps {
  entityType: NoteEntityType;
  entityId: string;
}

export default function NotesPanel({ entityType, entityId }: NotesPanelProps): React.JSX.Element {
  const { store } = useDataLayer();
  const noteIds = useNotesForEntity(store, entityType, entityId);
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = activeId ? getNote(store, activeId) : undefined;
  const effectiveActiveId =
    active && active.entityType === entityType && active.entityId === entityId
      ? active.id
      : null;
  const activeNote = effectiveActiveId ? getNote(store, effectiveActiveId) : undefined;

  function addNote(): void {
    const id = createNote(store, { title: 'New Note', entityType, entityId });
    setActiveId(id);
  }

  return (
    <section className="notes" aria-label="Notes">
      <div className="notes-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={effectiveActiveId === null}
          className={`notes-tab${effectiveActiveId === null ? ' notes-tab-active' : ''}`}
          onClick={() => setActiveId(null)}
        >
          Notes ({noteIds.length})
        </button>
        {activeNote && (
          <button
            type="button"
            role="tab"
            aria-selected
            className="notes-tab notes-tab-active"
          >
            {activeNote.title || 'Untitled'}
          </button>
        )}
        <span className="notes-tabs-spacer" />
        <button type="button" className="btn" onClick={addNote}>
          + Note
        </button>
      </div>

      {effectiveActiveId === null ? (
        noteIds.length === 0 ? (
          <p className="placeholder">No notes attached. Click <strong>+ Note</strong> to add one.</p>
        ) : (
          <ul className="notes-list">
            {noteIds.map((id) => {
              const note = getNote(store, id);
              if (!note) return null;
              return (
                <li key={id} className="notes-item">
                  <button type="button" className="notes-item-title" onClick={() => setActiveId(id)}>
                    {note.title || 'Untitled'}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <NoteEditor key={effectiveActiveId} noteId={effectiveActiveId} onDeleted={() => setActiveId(null)} />
      )}
    </section>
  );
}