import { useEffect, useRef, useState } from 'react';
import { useAppearance } from './useAppearance.ts';
import type { Density, FontFamily, ThemeMode } from './AppearanceProvider.tsx';
interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

const THEME_OPTIONS: SegmentedOption<ThemeMode>[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

const FONT_OPTIONS: SegmentedOption<FontFamily>[] = [
  { id: 'inter', label: 'Inter' },
  { id: 'dejavu', label: 'DejaVu Sans' },
  { id: 'liberation', label: 'Liberation Mono' },
];

const DENSITY_OPTIONS: SegmentedOption<Density>[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'normal', label: 'Normal' },
  { id: 'cozy', label: 'Cozy' },
];

export default function AppearanceMenu(): React.JSX.Element {
  const { theme, font, density, setTheme, setFont, setDensity } = useAppearance();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="appearance-fab" ref={rootRef}>
      <button
        type="button"
        className="appearance-fab-trigger"
        aria-label="Appearance settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <svg className="svg-icon appearance-fab-icon" aria-hidden="true">
          <use href="/icons.svg#palette-icon" />
        </svg>
      </button>
      {open && (
        <div className="appearance-menu" role="dialog" aria-label="Appearance">
          <Segmented
            label="Theme"
            options={THEME_OPTIONS}
            value={theme}
            onChange={setTheme}
          />
          <Segmented
            label="Font"
            options={FONT_OPTIONS}
            value={font}
            onChange={setFont}
          />
          <Segmented
            label="Density"
            options={DENSITY_OPTIONS}
            value={density}
            onChange={setDensity}
          />
        </div>
      )}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>): React.JSX.Element {
  return (
    <section className="appearance-segment" aria-label={label}>
      <header className="appearance-segment-label">{label}</header>
      <div className="appearance-segment-row" role="radiogroup" aria-label={label}>
        {options.map((opt) => {
          const active = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`appearance-segment-option${active ? ' appearance-segment-option-active' : ''}`}
              onClick={() => onChange(opt.id)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}