/**
 * Inline-editable title used by the Domain / Project editors.
 *
 * Renders the title as a text input styled to look like a heading; committing
 * (blur or Enter) writes through `onCommit`. Escape reverts to the current
 * `value`. Editing never calls `navigate`, so the URL stays stable while
 * typing (issue 11 — "committed" updates only).
 */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

export interface EditableTitleProps {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  autoFocusOnCreate?: boolean;
}

export function EditableTitle({
  value,
  onCommit,
  placeholder = 'Untitled',
  autoFocusOnCreate,
}: EditableTitleProps): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  // Keep the draft in sync when the upstream value changes (e.g. sync from
  // another device) and the field isn't focused.
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