/**
 * Two-step delete confirmation rendered inline (no native `confirm()` dialog).
 *
 * First click arms the button ("Delete?" label, destructive style); the
 * second click within `RESET_MS` fires `onConfirm`. Blurring or waiting
 * resets it. This keeps the flow keyboard- and screen-reader-friendly and
 * stays within normal DOM (Playwright can drive it with two clicks, no
 * `window.confirm` dialog handling required).
 */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

const RESET_MS = 4000;

export interface ConfirmButtonProps {
  onConfirm: () => void;
  label?: string;
  confirmLabel?: string;
  title?: string;
  disabled?: boolean;
}

export function ConfirmButton({
  onConfirm,
  label = 'Delete',
  confirmLabel = 'Delete?',
  title,
  disabled,
}: ConfirmButtonProps): React.JSX.Element {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function reset(): void {
    setArmed(false);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  }

  function handleClick(): void {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(reset, RESET_MS);
      return;
    }
    reset();
    onConfirm();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      reset();
    }
  }

  return (
    <button
      type="button"
      className={`btn btn-danger${armed ? ' btn-danger-armed' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onBlur={reset}
      title={title}
      disabled={disabled}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}