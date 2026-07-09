import { useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import {
  useDataLayer,
  useDomains,
  createNote,
  getNote,
} from '../data/index.ts';
import { useSelection } from './useSelection.ts';

const FIRST_LINE_MAX = 80;

export default function Composer(): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const rootIds = useDomains(store);
  const [body, setBody] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const canSave = body.trim().length > 0 && rootIds.length > 0;

  function onChange(e: ChangeEvent<HTMLTextAreaElement>): void {
    setBody(e.target.value);
  }

  function titleFor(value: string): string {
    const first = value.split('\n', 1)[0].trim();
    return first.slice(0, FIRST_LINE_MAX) || 'Untitled';
  }
  function save(): void {
    const trimmed = body.trim();
    if (!trimmed) return;
    const targetId = rootIds[0];
    if (!targetId) return;
    const id = createNote(store, {
      title: titleFor(trimmed),
      body: trimmed,
      entityType: 'domain',
      entityId: targetId,
    });
    const note = getNote(store, id);
    setBody('');
    taRef.current?.focus();
    if (note) navigate({ kind: 'note', slug: note.slug });
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  }

  return (
    <div className="composer">
      <textarea
        ref={taRef}
        className="composer-textarea"
        value={body}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={
          rootIds.length === 0
            ? 'Create a domain first to capture notes…'
            : 'Any thoughts…'
        }
        aria-label="New note"
        rows={3}
        disabled={rootIds.length === 0}
      />
      <div className="composer-bar">
        <button
          type="button"
          className="composer-icon-btn"
          aria-label="Add attachment"
          title="Add attachment"
          onClick={() => taRef.current?.focus()}
          disabled={rootIds.length === 0}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#plus-filled-icon" />
          </svg>
        </button>
        <button type="button" className="composer-visibility" aria-label="Visibility">
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#lock-icon" />
          </svg>
          <span>Private</span>
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#chevron-down-icon" />
          </svg>
        </button>
        <span className="composer-bar-spacer" />
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={!canSave}
          title={canSave ? 'Save (⌘/Ctrl+Enter)' : 'Add a domain to enable saving'}
        >
          Save
        </button>
      </div>
    </div>
  );
}
