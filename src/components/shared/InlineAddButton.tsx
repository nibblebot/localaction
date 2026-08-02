import { useState } from 'react';
import InlineAddField from './InlineAddField.tsx';

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
 * InlineAddField in place (focused, inside the header row itself).
 * Enter commits and collapses back to the button; Esc or blurring an
 * empty input also collapses. When the revealed input must render
 * somewhere other than the header (e.g. appended at the end of the
 * list), keep the button and compose InlineAddField directly instead.
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

  function setOpen(next: boolean): void {
    setOpenState(next);
    onOpenChange?.(next);
  }

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
    <InlineAddField
      placeholder={placeholder}
      ariaLabel={inputAriaLabel}
      onSubmit={onSubmit}
      onClose={() => setOpen(false)}
    />
  );
}
