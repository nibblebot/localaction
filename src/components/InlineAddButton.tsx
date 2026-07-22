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
}: InlineAddButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

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
