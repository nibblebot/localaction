import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  useDataLayer,
  useNotesForAreaTree,
  useNote,
  createNote,
  deleteNote,
  TABLES,
  COLUMNS,
  NOTE_ENTITY_TYPE,
} from '../../data/index.ts';
import ConfirmModal from '../shared/ConfirmModal.tsx';
import InlineAddButton from '../shared/InlineAddButton.tsx';
import { stripPreview } from './note-helpers.ts';

const NoteMarkdown = lazy(() => import('./NoteMarkdown.tsx'));

export default function NotesSection({
  areaId,
}: {
  areaId: string;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { areaNotes, taskNotes } = useNotesForAreaTree(
    store,
    areaId,
  );
  const allIds = useMemo(
    () => [...areaNotes, ...taskNotes],
    [areaNotes, taskNotes],
  );

  return (
    <section className="notes-tab" aria-label="Notes">
      <ul className="notes-tab-list" role="list">
        {allIds.map((nid) => (
          <NoteLine key={nid} noteId={nid} />
        ))}
      </ul>
    </section>
  );
}

/** The "+" in the NOTES section header: reveals a focused input in the
 * header row itself. Creation lives here (not in NotesSection) because
 * the header is rendered by MainPane's CollapsibleSection. */
export function AddNoteButton({ areaId, onOpen }: { areaId: string; onOpen: () => void }): React.JSX.Element {
  const { store } = useDataLayer();
  return (
    <InlineAddButton
      label="Add note"
      placeholder="New note…"
      inputAriaLabel="New note"
      className="area-tab-action-add"
      onSubmit={(title) =>
        createNote(store, { title, body: '', entityType: NOTE_ENTITY_TYPE.area, entityId: areaId })
      }
      onOpenChange={(open) => {
        if (open) onOpen();
      }}
    />
  );
}

export function NoteLine({ noteId }: { noteId: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const note = useNote(store, noteId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Keyboard users enter edit mode via the note title button; move
  // focus into the textarea once it mounts.
  useEffect(() => {
    if (editing) bodyRef.current?.focus();
  }, [editing]);

  if (!note) return <></>;
  const body = note.body ?? '';
  const title = note.title || 'Untitled';

  return (
    <li className="note-line">
      <div className="note-line-head">
        <button
          type="button"
          className="note-line-title"
          onClick={() => {
            setDraft(body);
            setEditing(true);
          }}
        >
          {title}
        </button>
        <span className="note-line-preview">{stripPreview(body) || 'Empty note'}</span>
        <button
          type="button"
          className="note-line-action note-line-action-danger icon-button"
          aria-label="Delete note"
          title="Delete"
          onClick={() => setConfirmDelete(true)}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#trash-icon" />
          </svg>
        </button>
      </div>
      {!editing && body.trim().length > 0 && (
        <Suspense
          fallback={
            <div className="markdown-body note-line-rendered">
              {stripPreview(body)}
            </div>
          }
        >
          <NoteMarkdown
            body={body}
            onClick={() => {
              setDraft(body);
              setEditing(true);
            }}
          />
        </Suspense>
      )}
      {!editing && body.trim().length === 0 && (
        <button
          type="button"
          className="note-line-empty"
          onClick={() => {
            setDraft('');
            setEditing(true);
          }}
        >
          Add note text…
        </button>
      )}
      {editing && (
        <textarea
          ref={bodyRef}
          className="note-line-body"
          aria-label="Note body"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.max(3, draft.split('\n').length)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false);
            else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.currentTarget.blur();
            }
          }}
          onBlur={() => {
            const next = draft;
            const cur = String(
              store.getCell(TABLES.notes, noteId, COLUMNS.notes.body) ?? '',
            );
            if (next !== cur) {
              if (next.trim().length === 0) {
                deleteNote(store, noteId);
              } else {
                store.setCell(TABLES.notes, noteId, COLUMNS.notes.body, next);
                store.setCell(
                  TABLES.notes,
                  noteId,
                  COLUMNS.notes.updatedAt,
                  new Date().toISOString(),
                );
              }
            }
            setEditing(false);
          }}
        />
      )}
      <ConfirmModal
        open={confirmDelete}
        title="Delete note?"
        message={`"${title}" will be deleted.`}
        confirmLabel="Delete"
        onConfirm={() => {
          deleteNote(store, noteId);
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </li>
  );
}
