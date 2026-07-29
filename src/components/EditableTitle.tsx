import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

export interface EditableTitleProps {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  /** Focus the input on mount (freshly created row). */
  autoFocus?: boolean;
}

export default function EditableTitle({
  value,
  onCommit,
  placeholder = 'Untitled',
  autoFocus = false,
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