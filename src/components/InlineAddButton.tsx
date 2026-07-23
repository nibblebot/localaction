import { useEffect, useRef, useState } from 'react';
import InlineAddInput from './InlineAddInput.tsx';

export interface InlineAddButtonProps {
  /** Visible button text and aria-label, e.g. "Add task". */
  label: string;
  /** Placeholder of the revealed input, e.g. "New task…". */
  placeholder: string;
  /** aria-label of the revealed input, e.g. "New task". */
  inputAriaLabel: string;
  onSubmit: (value: string) => void;
  /**
   * Hide the whole control (used when a sibling inline-add is open,
   * so only one footer input shows at a time).
   */
  hidden?: boolean;
  /** Notified whenever the input opens or collapses. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * A dashed "+" button that reveals an InlineAddInput on click (focused,
 * in place). Enter commits and collapses back to the button; Esc or
 * blurring an empty input also collapses. InlineAddInput itself stays
 * untouched — the toggle lives here.
 */
export default function InlineAddButton({
  label,
  placeholder,
  inputAriaLabel,
  onSubmit,
  hidden = false,
  onOpenChange,
}: InlineAddButtonProps): React.JSX.Element | null {
  const [open, setOpenState] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function setOpen(next: boolean): void {
    setOpenState(next);
    onOpenChange?.(next);
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (hidden) return null;

  if (!open) {
    return (
      <button
        type="button"
        className="inline-add-button"
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#add-icon" />
        </svg>
        {label}
      </button>
    );
  }

  return (
    <div
      className="inline-add-wrap"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
      onBlur={(e) => {
        if (
          !e.currentTarget.contains(e.relatedTarget as Node | null) &&
          !inputRef.current?.value.trim()
        ) {
          setOpen(false);
        }
      }}
    >
      <InlineAddInput
        ref={inputRef}
        placeholder={placeholder}
        ariaLabel={inputAriaLabel}
        onSubmit={(value) => {
          onSubmit(value);
          setOpen(false);
        }}
      />
    </div>
  );
}
