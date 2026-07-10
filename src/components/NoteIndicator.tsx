import { useDataLayer, useEntityNoteExists } from '../data/index.ts';
import type { NoteEntityType } from '../data/index.ts';

export interface NoteIndicatorProps {
  entityType: NoteEntityType;
  entityId: string;
  /**
   * If true, the indicator is non-interactive (purely visual). When false
   * (default), the icon is wrapped in a button that stops click propagation
   * so it can be used inside a row that already has its own click handler.
   */
  readonly?: boolean;
  className?: string;
}

/**
 * Small note icon used in entity list rows. Stroke colour switches between
 * grey (no note / empty body) and black (note present).
 */
export default function NoteIndicator({
  entityType,
  entityId,
  readonly = false,
  className,
}: NoteIndicatorProps): React.JSX.Element {
  const { store } = useDataLayer();
  const hasNote = useEntityNoteExists(store, entityType, entityId);
  const cls = `note-indicator${hasNote ? ' note-indicator-on' : ' note-indicator-off'}${
    className ? ` ${className}` : ''
  }`;

  if (readonly) {
    return (
      <span className={cls} aria-hidden="true" title={hasNote ? 'Has note' : 'No note'}>
        <svg className="svg-icon">
          <use href="/icons.svg#notes-icon" />
        </svg>
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      aria-label={hasNote ? 'Has note' : 'No note'}
      title={hasNote ? 'Has note' : 'No note'}
      onClick={(e) => e.stopPropagation()}
    >
      <svg className="svg-icon">
        <use href="/icons.svg#notes-icon" />
      </svg>
    </button>
  );
}
