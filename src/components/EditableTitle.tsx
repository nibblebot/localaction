import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

export interface EditableTitleProps {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  autoFocusOnCreate?: boolean;
}

export default function EditableTitle({
  value,
  onCommit,
  placeholder = 'Untitled',
  autoFocusOnCreate,
}: EditableTitleProps): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(value);
  }, [value]);

  useEffect(() => {
    if (autoFocusOnCreate && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [autoFocusOnCreate]);

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