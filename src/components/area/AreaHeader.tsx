import { useState } from 'react';
import type { MouseEvent } from 'react';
import {
  useDataLayer,
  captureSubtree,
  restoreSubtree,
  deleteArea,
  NOTE_ENTITY_TYPE,
} from '../../data/index.ts';
import { areaColorHex } from '../../data/colors.ts';
import type { AreaColorId } from '../../data/colors.ts';
import { useUndo } from '../context/useUndo.ts';
import AreaEditPopover from './AreaEditPopover.tsx';
import ConfirmModal from '../shared/ConfirmModal.tsx';
import CompletedToggle from '../shared/CompletedToggle.tsx';
import type { HeaderArea } from './types.ts';

function AreaHeader({
  areaId,
  name,
  color,
  parent,
  showCompleted,
  onToggleCompleted,
  onNavigate,
  onDeleteArea,
}: {
  areaId: string;
  parent: HeaderArea | null;
  name: string;
  color: AreaColorId;
  showCompleted: boolean;
  onToggleCompleted: () => void;
  onNavigate: (id: string) => void;
  onDeleteArea: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const hex = areaColorHex(color);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editAnchor, setEditAnchor] = useState<{ x: number; y: number } | null>(null);
  const { offerUndo } = useUndo();

  function openEditor(e: MouseEvent<HTMLElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    setEditAnchor({ x: rect.left, y: rect.bottom + 6 });
  }

  return (
    <div className="area-header">
      {parent && (
        <>
          <button
            type="button"
            className="area-header-crumb"
            onClick={() => onNavigate(parent.id)}
            aria-label={`Go to parent area: ${parent.name || 'Untitled'}`}
            title={parent.name || 'Untitled'}
          >
            ..
          </button>
          <span className="area-header-slash" aria-hidden="true">
            /
          </span>
        </>
      )}
      <h1 className="area-header-name">
        <button
          type="button"
          className="area-header-name-edit"
          onClick={openEditor}
          title="Edit area"
          aria-haspopup="dialog"
          aria-expanded={editAnchor !== null}
        >
          <span
            className="area-header-name-edit-dot"
            style={{ background: hex }}
            aria-hidden="true"
          />
          <span className="area-header-name-edit-text">{name || 'Untitled'}</span>
        </button>
      </h1>
      <div className="area-header-actions">
        <CompletedToggle showCompleted={showCompleted} onToggle={onToggleCompleted} />
      </div>
      <AreaEditPopover
        anchor={editAnchor}
        areaId={areaId}
        name={name}
        color={color}
        onClose={() => setEditAnchor(null)}
        onRequestDelete={() => {
          setEditAnchor(null);
          setConfirmDelete(true);
        }}
      />
      <ConfirmModal
        open={confirmDelete}
        title="Delete area?"
        message={`"${name || 'Untitled'}" will be deleted along with every sub-area, task and note inside it.`}
        confirmLabel="Delete"
        onConfirm={() => {
          const snapshot = captureSubtree(store, NOTE_ENTITY_TYPE.area, areaId);
          deleteArea(store, areaId);
          setConfirmDelete(false);
          onDeleteArea();
          offerUndo({
            label: `Deleted area “${name || 'Untitled'}”`,
            onUndo: () => {
              restoreSubtree(store, snapshot);
              onNavigate(areaId);
            },
          });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export default AreaHeader;
