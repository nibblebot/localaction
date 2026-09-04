import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

export interface InlineAddInputProps {
  placeholder: string;
  ariaLabel: string;
  onSubmit: (value: string) => void;
  /** Shift+Enter quick entry: commits and clears WITHOUT any close side
   * effect the caller wires into `onSubmit`, so the field stays open for
   * the next item. Falls back to `onSubmit` when absent. */
  onSubmitContinue?: (value: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Always-visible single-line text input appended to a list. Enter
 * commits the trimmed value (if non-empty) and clears the field;
 * Shift+Enter does the same through `onSubmitContinue` (quick entry);
 * Esc clears any in-progress draft. The parent focuses the field via
 * the imperative `focus()` ref handle (typically from a "+" button).
 */
const InlineAddInput = forwardRef<HTMLInputElement, InlineAddInputProps>(
  function InlineAddInput(
    { placeholder, ariaLabel, onSubmit, onSubmitContinue, className, size = 'md' },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current!);
    const [value, setValue] = useState('');

    function commit(andContinue: boolean): void {
      const trimmed = value.trim();
      if (!trimmed) return;
      (andContinue && onSubmitContinue ? onSubmitContinue : onSubmit)(trimmed);
      setValue('');
    }

    function cancel(): void {
      setValue('');
      inputRef.current?.blur();
    }

    const classes = ['inline-add-input'];
    if (size === 'sm') classes.push('inline-add-input-sm');
    if (className) classes.push(className);

    return (
      <input
        ref={inputRef}
        type="text"
        className={classes.join(' ')}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(e.shiftKey);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
      />
    );
  },
);

export default InlineAddInput;
