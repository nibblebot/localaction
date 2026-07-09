import { useEffect, useRef, useState } from 'react';

export interface PromptModalProps {
  open: boolean;
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export default function PromptModal({
  open,
  title,
  label,
  placeholder,
  initialValue = '',
  submitLabel = 'Create',
  cancelLabel = 'Cancel',
  onSubmit,
  onCancel,
}: PromptModalProps): React.JSX.Element | null {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, initialValue, onCancel]);

  if (!open) return null;
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0;

  function handleSubmit(): void {
    if (!canSubmit) return;
    onSubmit(trimmed);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="prompt-modal-title">{title}</h3>
        {label && <label className="modal-label" htmlFor="prompt-modal-input">{label}</label>}
        <input
          ref={inputRef}
          id="prompt-modal-input"
          type="text"
          className="modal-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
