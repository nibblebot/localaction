import { useState } from 'react';
import { useDataLayer, type NoteEntityType } from '../../data/index.ts';
import { usePeopleForEntity } from '../../data/personSelectors.ts';
import PersonAvatarsRow from './PersonAvatarsRow.tsx';
import PersonAssignmentPopover from './PersonAssignmentPopover.tsx';
import { useEntityPersonIds } from '../../data/personLinks.ts';

export interface PersonAssignmentButtonProps {
  entityType: NoteEntityType;
  entityId: string;
  /** Title rendered at the top of the popover, e.g. "Assign · Family's cast". */
  pickerTitle?: string;
}

/**
 * The clickable surface that opens the assignment popover. Renders
 * the resolved people avatars (per spec §7.3 rows always
 * show the avatars — Self disc included — even when the resolved
 * set is just {Self}). Clicking anchors the popover.
 */
export default function PersonAssignmentButton({
  entityType,
  entityId,
  pickerTitle,
}: PersonAssignmentButtonProps): React.JSX.Element {
  const { store } = useDataLayer();
  const people = usePeopleForEntity(store, entityType, entityId);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const current = useEntityPersonIds(store, entityType, entityId);

  function handleClick(e: React.MouseEvent<HTMLButtonElement>): void {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setAnchor({ x: r.left, y: r.bottom + 4 });
  }

  return (
    <>
      <button
        type="button"
        className="person-avatars"
        onClick={handleClick}
        title="Edit persons"
        style={{
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <PersonAvatarsRow personIds={people} small />
      </button>
      <PersonAssignmentPopover
        anchor={anchor}
        entityType={entityType}
        entityId={entityId}
        current={current}
        title={pickerTitle}
        onClose={() => setAnchor(null)}
      />
    </>
  );
}