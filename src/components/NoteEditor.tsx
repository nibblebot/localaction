/**
 * Standalone markdown note editor: title, split textarea/preview, backlinks.
 *
 * Shared by `NotesPanel` (entity-attached) and note deep-links (`#/n/<slug>`).
 * The preview resolves `[[Wiki Links]]` against a `NoteIndex` of every note
 * in the store; clicking a link navigates via the hash router.
 *
 * The note read hooks (`useNoteReactive`, `useNoteIdForSlug`) live in
 * `noteHooks.ts` so this file only exports components.
 */

import { useMemo } from 'react';
import { useRowIds } from 'tinybase/ui-react';
import {
  useDataLayer,
  updateNote,
  deleteNote,
  getNote,
  TABLES,
} from '../data/index.ts';
import { extractWikiLinks } from '../markdown/wikiLinks.ts';
import { buildNoteIndex, renderMarkdown } from '../markdown/render.ts';
import { useSelection } from './useSelection.ts';
import { ConfirmButton } from './ConfirmButton.tsx';
import { useNoteReactive } from './noteHooks.ts';

export interface NoteEditorProps {
  noteId: string;
  onDeleted?: () => void;
}

export function NoteEditor({ noteId, onDeleted }: NoteEditorProps): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const note = useNoteReactive(store, noteId);
  const allIds = useRowIds(TABLES.notes, store);
  const index = useMemo(
    () =>
      buildNoteIndex(
        allIds
          .map((id) => getNote(store, id))
          .filter((n): n is NonNullable<typeof n> => !!n)
          .map((n) => ({ id: n.id, slug: n.slug, title: n.title })),
      ),
    [store, allIds],
  );

  if (!note) return <></>;

  const backlinkIds = allIds.filter((otherId) => {
    if (otherId === noteId) return false;
    const other = getNote(store, otherId);
    if (!other) return false;
    return extractWikiLinks(other.body)
      .map((t) => t.toLowerCase())
      .includes(note.title.toLowerCase());
  });

  const html = renderMarkdown(note.body, index);

  function remove(): void {
    deleteNote(store, noteId);
    onDeleted?.();
    navigate({ kind: 'home' });
  }

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

      <div className="note-editor-split">
        <textarea
          className="note-textarea"
          value={note.body}
          onChange={(e) => updateNote(store, noteId, { body: e.target.value })}
          placeholder="Write markdown… use [[Note Title]] to link notes."
          aria-label="Note body"
        />
        <div
          className="note-preview markdown-body"
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={(e) => handlePreviewClick(e, (slug) => navigate({ kind: 'note', slug }))}
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
  onNavigateSlug: (slug: string) => void,
): void {
  const target = e.target as HTMLElement;
  const anchor = target.closest('a.wiki-link') as HTMLAnchorElement | null;
  if (!anchor) return;
  e.preventDefault();
  const href = anchor.getAttribute('href') ?? '';
  const slug = href.replace(/^#\/n\//, '');
  if (slug) onNavigateSlug(decodeURIComponent(slug));
}