import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  useDataLayer,
  updateNote,
  deleteNote,
  createNote,
  getNote,
  getDomain,
  getProject,
  getTask,
  useNote,
  useNoteIndex,
  useAllNoteIds,
  TABLES,
} from '../data/index.ts';
import type { NoteEntityType } from '../data/index.ts';
import { extractWikiLinks } from '../markdown/wikiLinks.ts';
import { renderMarkdown } from '../markdown/render.ts';
import { slugify } from '../data/slug.ts';
import { useSelection } from './useSelection.ts';
import ConfirmButton from './ConfirmButton.tsx';

export interface NoteEditorProps {
  noteId: string;
  onDeleted?: () => void;
  onCreated?: (id: string) => void;
}

export default function NoteEditor({ noteId, onDeleted, onCreated }: NoteEditorProps): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const note = useNote(store, noteId);
  const allIds = useAllNoteIds(store);
  const index = useNoteIndex(store, noteId);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [autocomplete, setAutocomplete] = useState<{
    query: string;
    start: number;
  } | null>(null);

  if (!note) return <></>;

  const body = note.body;
  const backlinkIds = allIds.filter((otherId) => {
    if (otherId === noteId) return false;
    const other = getNote(store, otherId);
    if (!other) return false;
    const titles = extractWikiLinks(other.body).map((t) => t.toLowerCase());
    return (
      titles.includes(note.title.toLowerCase()) ||
      titles.includes(note.slug.toLowerCase()) ||
      titles.includes(slugify(note.title))
    );
  });

  const html = renderMarkdown(body, index);

  function remove(): void {
    deleteNote(store, noteId);
    onDeleted?.();
    navigate({ kind: 'home' });
  }

  function detectAutocomplete(value: string, caret: number): void {
    const upTo = value.slice(0, caret);
    const open = upTo.lastIndexOf('[[');
    if (open === -1) {
      setAutocomplete(null);
      return;
    }
    const closeAfter = upTo.indexOf(']]', open + 2);
    if (closeAfter !== -1 && closeAfter < caret) {
      setAutocomplete(null);
      return;
    }
    const newlineAfter = upTo.indexOf('\n', open + 2);
    if (newlineAfter !== -1 && newlineAfter < caret) {
      setAutocomplete(null);
      return;
    }
    setAutocomplete({ query: upTo.slice(open + 2, caret), start: open });
  }

  function onBodyChange(e: ChangeEvent<HTMLTextAreaElement>): void {
    updateNote(store, noteId, { body: e.target.value });
    detectAutocomplete(e.target.value, e.target.selectionStart);
  }

  function pickAutocomplete(title: string): void {
    if (!autocomplete) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const before = body.slice(0, autocomplete.start);
    const after = body.slice(autocomplete.start + 2 + autocomplete.query.length);
    const inserted = `${title}]]`;
    const next = `${before}[[${inserted}${after}`;
    updateNote(store, noteId, { body: next });
    setAutocomplete(null);
    requestAnimationFrame(() => {
      const caret = before.length + 2 + inserted.length;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  }

  function closeAutocomplete(): void {
    setAutocomplete(null);
  }

  const suggestions = autocomplete
    ? allIds
        .map((id) => getNote(store, id))
        .filter((n): n is NonNullable<typeof n> => !!n)
        .filter(
          (n) =>
            n.id !== noteId &&
            n.title.toLowerCase().includes(autocomplete.query.toLowerCase()),
        )
        .slice(0, 8)
    : [];

  return (
    <div className="note-editor">
      <div className="note-editor-toolbar">
        <input
          className="note-title-input"
          value={note.title}
          onChange={(e) => updateNote(store, noteId, { title: e.target.value })}
          aria-label="Note title"
        />
        <ConfirmButton onConfirm={remove} />
      </div>

      <div className="note-attach">
        <label className="field">
          <span className="field-label">Attach to</span>
          <select
            className="field-select"
            value={note.entityType}
            onChange={(e) =>
              updateNote(store, noteId, {
                entityType: e.target.value as NoteEntityType,
              })
            }
          >
            <option value="domain">Domain</option>
            <option value="project">Project</option>
            <option value="task">Task</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Entity</span>
          <select
            className="field-select"
            value={note.entityId ?? ''}
            onChange={(e) =>
              updateNote(store, noteId, { entityId: e.target.value || null })
            }
          >
            <option value="">(unattached)</option>
            {attachCandidates(store, note.entityType).map((id) => (
              <option key={id} value={id}>
                {attachLabel(store, note.entityType, id)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="note-editor-split">
        <div className="note-textarea-wrap">
          <textarea
            ref={textareaRef}
            className="note-textarea"
            value={note.body}
            onChange={onBodyChange}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && autocomplete) {
                e.preventDefault();
                closeAutocomplete();
              }
            }}
            placeholder="Write markdown… use [[Note Title]] to link notes."
            aria-label="Note body"
          />
          {autocomplete && suggestions.length > 0 && (
            <ul className="wikilink-autocomplete" role="listbox">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickAutocomplete(s.title);
                    }}
                  >
                    {s.title || 'Untitled'}
                  </button>
                </li>
              ))}
              {autocomplete.query.trim().length > 0 &&
                !suggestions.some(
                  (s) => s.title.toLowerCase() === autocomplete.query.toLowerCase(),
                ) && (
                  <li>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickAutocomplete(autocomplete.query);
                      }}
                    >
                      Create “{autocomplete.query}”
                    </button>
                  </li>
                )}
            </ul>
          )}
        </div>
        <div
          className="note-preview markdown-body"
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={(e) =>
            handlePreviewClick(
              e,
              store,
              noteId,
              (slug) => navigate({ kind: 'note', slug }),
              onCreated,
            )
          }
        />
      </div>

      {backlinkIds.length > 0 && (
        <aside className="backlinks" aria-label="Backlinks">
          <h4>Backlinks</h4>
          <ul>
            {backlinkIds.map((otherId) => {
              const other = getNote(store, otherId)!;
              return (
                <li key={otherId}>
                  <button type="button" onClick={() => navigate({ kind: 'note', slug: other.slug })}>
                    {other.title || 'Untitled'}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      )}
    </div>
  );
}

function handlePreviewClick(
  e: React.MouseEvent<HTMLDivElement>,
  store: ReturnType<typeof useDataLayer>['store'],
  noteId: string,
  onNavigateSlug: (slug: string) => void,
  onCreated?: (id: string) => void,
): void {
  const target = e.target as HTMLElement;
  const anchor = target.closest('a.wiki-link') as HTMLAnchorElement | null;
  if (!anchor) return;
  e.preventDefault();
  const href = anchor.getAttribute('href') ?? '';
  const slug = href.replace(/^#\/n\//, '');
  if (!slug) return;
  const targetSlug = decodeURIComponent(slug);
  if (anchor.classList.contains('wiki-link-missing')) {
    const titleMatch = anchor.textContent ?? targetSlug;
    const newId = createNote(store, {
      title: titleMatch,
      entityType: 'domain',
      entityId: noteId,
    });
    void newId;
    onCreated?.(newId);
    return;
  }
  onNavigateSlug(targetSlug);
}

function attachCandidates(
  store: ReturnType<typeof useDataLayer>['store'],
  type: NoteEntityType,
): string[] {
  const table =
    type === 'domain' ? TABLES.domains : type === 'project' ? TABLES.projects : TABLES.tasks;
  return store.getRowIds(table);
}

function attachLabel(
  store: ReturnType<typeof useDataLayer>['store'],
  type: NoteEntityType,
  id: string,
): string {
  if (type === 'domain') {
    const d = getDomain(store, id);
    return d?.name || 'Untitled domain';
  }
  if (type === 'project') {
    const p = getProject(store, id);
    return p?.name || 'Untitled project';
  }
  const t = getTask(store, id);
  return t?.title || 'Untitled task';
}