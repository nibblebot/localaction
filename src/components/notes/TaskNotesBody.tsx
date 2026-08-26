import { useRef } from 'react';
import {
  useDataLayer,
  useNoteIdsForEntity,
  createNote,
  NOTE_ENTITY_TYPE,
} from '../../data/index.ts';
import InlineAddInput from '../shared/InlineAddInput.tsx';
import { NoteLine } from './NotesSection.tsx';
import { useFocusEmptyList } from '../hooks/useFocusEmptyList.ts';

/**
 * The note body editor for a task detail pane: the task-scoped notes
 * (entityType 'task') listed as editable markdown lines, plus an add-note
 * input. Gated by NOTES_ENABLED at the call site.
 */
export default function TaskNotesBody({ taskId }: { taskId: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const noteIds = useNoteIdsForEntity(store, NOTE_ENTITY_TYPE.task, taskId);

  function addNote(title: string): void {
    createNote(store, {
      title,
      body: '',
      entityType: NOTE_ENTITY_TYPE.task,
      entityId: taskId,
    });
  }

  const addInputRef = useRef<HTMLInputElement>(null);
  useFocusEmptyList(addInputRef, noteIds.length === 0);

  return (
    <>
      <ul className="notes-tab-list" role="list">
        {noteIds.map((nid) => (
          <NoteLine key={nid} noteId={nid} />
        ))}
      </ul>
      <InlineAddInput
        ref={addInputRef}
        placeholder={
          noteIds.length === 0 ? 'No notes yet — add the first one.' : 'New note…'
        }
        ariaLabel="New note"
        onSubmit={addNote}
      />
    </>
  );
}