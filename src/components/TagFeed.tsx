import { useDataLayer, useNoteIdsForTag, getNote, extractTags } from '../data/index.ts';
import type { Note } from '../data/index.ts';
import { renderMarkdown } from '../markdown/render.ts';
import { useSelection } from './useSelection.ts';

export interface TagFeedProps {
  tag: string;
}

export default function TagFeed({ tag }: TagFeedProps): React.JSX.Element {
  const { store } = useDataLayer();
  const ids = useNoteIdsForTag(store, tag);

  if (ids.length === 0) {
    return (
      <div className="tag-feed-header">
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#tag-icon" />
        </svg>
        <span>No notes tagged <strong>#{tag}</strong> yet.</span>
      </div>
    );
  }

  return (
    <div>
      <div className="tag-feed-header">
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#tag-icon" />
        </svg>
        <span>
          Tagged <strong>#{tag}</strong> · {ids.length} note{ids.length === 1 ? '' : 's'}
        </span>
      </div>
      <ul className="tag-feed-list" role="list">
        {ids.map((id) => {
          const note = getNote(store, id);
          if (!note) return null;
          return <MemoCard key={id} note={note} />;
        })}
      </ul>
    </div>
  );
}

function MemoCard({ note }: { note: Note }): React.JSX.Element | null {
  const { navigate } = useSelection();
  if (!note) return null;
  const html = renderMarkdown(note.body);
  const tags = extractTags(note.body);
  const time = relativeTime(note.updatedAt);

  return (
    <li className="memo-card">
      <div className="memo-card-head">
        <time dateTime={note.updatedAt}>{time}</time>
        <span className="memo-card-actions">
          <button type="button" className="btn btn-ghost btn-sm" title="Restore" aria-label="Restore">
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#restore-icon" />
            </svg>
          </button>
          <button type="button" className="btn btn-ghost btn-sm" title="More" aria-label="More">
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#more-icon" />
            </svg>
          </button>
        </span>
      </div>
      <button
        type="button"
        className="memo-card-title"
        onClick={() => navigate({ kind: 'note', slug: note.slug })}
      >
        {note.title || 'Untitled'}
      </button>
      <div
        className="memo-card-body markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {tags.length > 0 && (
        <div className="memo-card-tags">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className="tag"
              onClick={() => navigate({ kind: 'tag', value: t })}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}
