import { useEffect, useRef } from 'react';
import InlineAddInput from './InlineAddInput.tsx';

export interface InlineAddFieldProps {
  /** Placeholder of the input, e.g. "New note…". */
  placeholder: string;
  /** aria-label of the input, e.g. "New note". */
  ariaLabel: string;
  onSubmit: (value: string) => void;
  /** Close request: Esc, or blurring an empty input. A successful
   * submit closes too. */
  onClose: () => void;
}

/**
 * The revealed half of an inline-add affordance: a focused
 * InlineAddInput that commits on Enter and asks to close on Esc or on
 * blurring an empty input. Split from InlineAddButton so the trigger
 * and the input can render in different places — e.g. a header "+"
 * whose input opens appended at the end of the list.
 */
export default function InlineAddField({
  placeholder,
  ariaLabel,
  onSubmit,
  onClose,
}: InlineAddFieldProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="inline-add-wrap"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      onBlur={(e) => {
        if (
          !e.currentTarget.contains(e.relatedTarget as Node | null) &&
          !inputRef.current?.value.trim()
        ) {
          onClose();
        }
      }}
    >
      <InlineAddInput
        ref={inputRef}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        onSubmit={(value) => {
          onSubmit(value);
          onClose();
        }}
      />
    </div>
  );
}
