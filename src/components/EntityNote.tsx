import { useEffect, useRef, useState } from 'react';
import {
  useDataLayer,
  useNote,
  useEntityNoteId,
  getEntityNoteId,
  getOrCreateEntityNote,
  updateNote,
  deleteNote,
  COLUMNS,
  TABLES,
} from '../data/index.ts';
import type { NoteEntityType } from '../data/index.ts';
import { renderMarkdown } from '../markdown/render.ts';

export interface EntityNoteProps {
  entityType: NoteEntityType;
  entityId: string;
}

/**
 * Single-note view for a domain/project/task. Renders the note as markdown
 * by default. Click the rendered area to switch to a textarea for editing;
 * blur (or Escape) saves and reverts to rendered mode.
 */
export default function EntityNote({ entityType, entityId }: EntityNoteProps): React.JSX.Element {
  const { store } = useDataLayer();
  const noteId = useEntityNoteId(store, entityType, entityId);
  const note = useNote(store, noteId ?? undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When switching to edit mode, seed the textarea with the current body and
  // focus/select it.
  useEffect(() => {
    if (!editing) return;
    setDraft(note?.body ?? '');
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [editing, note?.body]);

  function startEditing(): void {
    // If there's no note yet, create one before switching to edit mode.
    if (!noteId) {
      getOrCreateEntityNote(store, entityType, entityId);
    }
    setEditing(true);
  }

  function commit(): void {
    // The reactive noteId can lag a tick behind a freshly-created note, so
    // resolve the latest id from the store on commit.
    const id = noteId ?? getEntityNoteId(store, entityType, entityId);
    if (!id) {
      setEditing(false);
      return;
    }
    const next = draft;
    const currentBody = String(store.getCell(TABLES.notes, id, COLUMNS.notes.body) ?? '');
    if (next !== currentBody) {
      if (next.trim().length === 0) {
        // Empty notes are removed entirely so the icon shows the empty state.
        deleteNote(store, id);
      } else {
        updateNote(store, id, { body: next });
      }
    }
    setEditing(false);
  }

  function cancel(): void {
    setEditing(false);
  }

  // No note exists yet — show a single empty-state affordance.
  if (!noteId) {
    return (
      <section className="entity-note" aria-label="Note">
        <header className="notes-header">
          <h3>Note</h3>
        </header>
        <button
          type="button"
          className="entity-note-empty"
          onClick={startEditing}
          aria-label="Add a note"
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#notes-icon" />
          </svg>
          <span>Click to add a note</span>
        </button>
      </section>
    );
  }

  const body = note?.body ?? '';

  if (editing) {
    return (
      <section className="entity-note" aria-label="Note">
        <header className="notes-header">
          <h3>Note</h3>
        </header>
        <textarea
          ref={textareaRef}
          className="entity-note-edit"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          aria-label="Note body"
          rows={Math.max(4, draft.split('\n').length)}
        />
      </section>
    );
  }

  return (
    <section className="entity-note" aria-label="Note">
      <header className="notes-header">
        <h3>Note</h3>
      </header>
      <div
        className="entity-note-display markdown-body"
        role="button"
        tabIndex={0}
        onClick={startEditing}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            startEditing();
          }
        }}
        aria-label="Edit note"
      >
        {body.trim().length > 0 ? (
          <div
            // markdown-it output is sanitized via the configured parser; rendering
            // is intentional here.
            dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
          />
        ) : (
          <p className="entity-note-display-empty">Click to write a note.</p>
        )}
      </div>
    </section>
  );
}
