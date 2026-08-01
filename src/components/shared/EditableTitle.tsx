import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

export interface EditableTitleProps {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  /** Focus the input on mount (freshly created row). */
  autoFocus?: boolean;
  /** Notify when the input gains/loses focus — lets the parent
   * surface chrome (e.g. a delete button riding the input) only
   * while the user is actually editing. */
  onEditingChange?: (editing: boolean) => void;
}

export default function EditableTitle({
  value,
  onCommit,
  placeholder = 'Untitled',
  autoFocus = false,
  onEditingChange,
}: EditableTitleProps): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  // Mount-only in practice: autoFocus is a mount-stable constant
  // (captured from the focus handoff), so this fires exactly once.
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(value);
  }, [value]);

  // Keep the editing-change callback in sync with the actual focus
  // state of the input — focus / blur are the only real signals
  // (the component is always an <input>, so "editing" == "focused").
  useEffect(() => {
    const el = ref.current;
    if (!el || !onEditingChange) return;
    const onFocus = (): void => onEditingChange(true);
    const onBlur = (): void => onEditingChange(false);
    el.addEventListener('focus', onFocus);
    el.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('focus', onFocus);
      el.removeEventListener('blur', onBlur);
    };
  }, [onEditingChange]);

  function commit(): void {
    const next = draft.trim();
    if (next !== value) onCommit(next || placeholder);
    else setDraft(value);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      ref.current?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value);
      ref.current?.blur();
    }
  }

  return (
    <input
      ref={ref}
      className="editable-title"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      aria-label="Title"
    />
  );
}
