import { useEffect, useRef, useState } from 'react';
import InlineAddInput from './InlineAddInput.tsx';

export interface InlineAddButtonProps {
  /** aria-label and title of the closed "+" button, e.g. "Add note". */
  label: string;
  /** Placeholder of the revealed input, e.g. "New note…". */
  placeholder: string;
  /** aria-label of the revealed input, e.g. "New note". */
  inputAriaLabel: string;
  onSubmit: (value: string) => void;
  /** Extra class on the closed "+" button (placement overrides). */
  className?: string;
  /** Notified whenever the input opens or collapses. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * A compact "+" icon button for a section/group header that reveals an
 * InlineAddInput in place (focused, inside the header row itself).
 * Enter commits and collapses back to the button; Esc or blurring an
 * empty input also collapses. InlineAddInput itself stays untouched —
 * the toggle lives here.
 */
export default function InlineAddButton({
  label,
  placeholder,
  inputAriaLabel,
  onSubmit,
  className,
  onOpenChange,
}: InlineAddButtonProps): React.JSX.Element {
  const [open, setOpenState] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function setOpen(next: boolean): void {
    setOpenState(next);
    onOpenChange?.(next);
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        className={`area-tab-action icon-button${className ? ` ${className}` : ''}`}
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#add-icon" />
        </svg>
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
