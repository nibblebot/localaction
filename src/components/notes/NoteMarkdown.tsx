import { renderMarkdown } from '../../markdown/render.ts';

/**
 * Rendered markdown body of a note line. Isolated into its own
 * component so `React.lazy` can split markdown-it (~100KB min) out
 * of the main bundle — it's only ever needed on notes surfaces.
 * The Suspense fallback in NoteLine renders the plain-text preview.
 */
export default function NoteMarkdown({
  body,
  onClick,
}: {
  body: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <div
      className="markdown-body note-line-rendered"
      role="document"
      aria-label="Note body — press Enter to edit"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        // Links in the rendered markdown keep their own keyboard behavior.
        if (e.target === e.currentTarget && e.key === 'Enter') {
          e.preventDefault();
          onClick();
        }
      }}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
    />
  );
}
