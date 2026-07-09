import { useEffect } from 'react';
import type { ReactNode } from 'react';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function Drawer({ open, onClose, children }: DrawerProps): React.JSX.Element {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={`drawer-backdrop${open ? ' drawer-backdrop-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`drawer${open ? ' drawer-open' : ''}`}
        aria-label="Sidebar"
        aria-hidden={!open}
      >
        <button
          type="button"
          className="drawer-close"
          onClick={onClose}
          aria-label="Close sidebar"
          tabIndex={open ? 0 : -1}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#close-icon" />
          </svg>
        </button>
        {open ? children : null}
      </aside>
    </>
  );
}
