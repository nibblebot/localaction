import { useEffect, useRef, useState } from 'react';
import { createTask, useDataLayer } from '../../data/index.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';

/** True when focus is in an editable element, where Shift+A must type "A". */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Global quick-add: Shift+A (when no input is focused) opens a modal with
 * a single text field. Enter commits the trimmed title as a new Inbox
 * task (no placement — see glossary "Inbox") and closes; Esc or the
 * backdrop cancels without saving.
 */
export default function QuickAddModal(): React.JSX.Element | null {
  const { store } = useDataLayer();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'A' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function close(): void {
    setOpen(false);
    setValue('');
  }

  function commit(): void {
    const title = value.trim();
    if (title) createTask(store, { title });
    close();
  }

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={close}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="quick-add-title">Quick add</h3>
        <input
          ref={inputRef}
          type="text"
          className="quick-add-input"
          placeholder="Task title"
          aria-label="Task title"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
        />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={commit}
            disabled={!value.trim()}
          >
            Add to Inbox
          </button>
        </div>
      </div>
    </div>
  );
}
