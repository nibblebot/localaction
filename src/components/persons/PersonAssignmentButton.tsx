import { useState } from 'react';
import { useDataLayer, useStoreVersion, type NoteEntityType } from '../../data/index.ts';
import { useEffectiveSet, effectiveCastSetForEntity } from '../../data/personSelectors.ts';
import PersonAvatarsRow from './PersonAvatarsRow.tsx';
import PersonAssignmentPopover from './PersonAssignmentPopover.tsx';
import { getEntityPersonIds } from '../../data/personLinks.ts';

export interface PersonAssignmentButtonProps {
  entityType: NoteEntityType;
  entityId: string;
  /** Title rendered at the top of the popover, e.g. "Assign · Family's cast". */
  pickerTitle?: string;
}

/**
 * The clickable surface that opens the assignment popover. Renders
 * the resolved effective-set avatars (per spec §7.3 rows always
 * show the avatars — Self disc included — even when the resolved
 * set is just {Self}). Clicking anchors the popover.
 */
export default function PersonAssignmentButton({
  entityType,
  entityId,
  pickerTitle,
}: PersonAssignmentButtonProps): React.JSX.Element {
  const { store } = useDataLayer();
  useStoreVersion(store);
  const effective = useEffectiveSet(store, entityType, entityId);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const cast = effectiveCastSetForEntity(store, entityType, entityId);
  const castList = [...cast];
  const current = getEntityPersonIds(store, entityType, entityId);

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
        <PersonAvatarsRow personIds={effective} small />
      </button>
      <PersonAssignmentPopover
        anchor={anchor}
        entityType={entityType}
        entityId={entityId}
        current={current}
        cast={castList}
        title={pickerTitle}
        onClose={() => setAnchor(null)}
      />
    </>
  );
}