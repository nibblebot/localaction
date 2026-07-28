import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppearanceContext } from './context.ts';

export type ThemeMode = 'light' | 'dark' | 'system';
export type FontFamily = 'jakarta' | 'plex' | 'general' | 'manrope' | 'dm';
export type Density = 'compact' | 'normal' | 'cozy';

export interface AppearanceState {
  theme: ThemeMode;
  font: FontFamily;
  density: Density;
  setTheme: (next: ThemeMode) => void;
  setFont: (next: FontFamily) => void;
  setDensity: (next: Density) => void;
}

// Keep in sync with the font boot script in index.html, which reads this key
// and the font ids pre-paint to preload only the active font.
const STORAGE_KEY = 'localaction.appearance.v1';
const THEME_ATTR = 'data-la-theme';
const FONT_ATTR = 'data-la-font';
const DENSITY_ATTR = 'data-la-density';

const DEFAULT: { theme: ThemeMode; font: FontFamily; density: Density } = {
  theme: 'system',
  font: 'dm',
  density: 'normal',
};

interface StoredShape {
  theme?: ThemeMode;
  font?: FontFamily;
  density?: Density;
}

function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'system';
}
function isFont(v: unknown): v is FontFamily {
  return v === 'jakarta' || v === 'plex' || v === 'general' || v === 'manrope' || v === 'dm';
}
function isDensity(v: unknown): v is Density {
  return v === 'compact' || v === 'normal' || v === 'cozy';
}

function loadStored(): StoredShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const p = parsed as Record<string, unknown>;
    return {
      theme: isThemeMode(p.theme) ? p.theme : undefined,
      font: isFont(p.font) ? p.font : undefined,
      density: isDensity(p.density) ? p.density : undefined,
    };
  } catch {
    return {};
  }
}

function persist(state: StoredShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (private mode); degrade silently.
  }
}

function applyTheme(mode: ThemeMode): void {
  document.documentElement.setAttribute(THEME_ATTR, mode);
}
function applyFont(font: FontFamily): void {
  document.documentElement.setAttribute(FONT_ATTR, font);
}
function applyDensity(density: Density): void {
  document.documentElement.setAttribute(DENSITY_ATTR, density);
}

export function AppearanceProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [theme, setThemeState] = useState<ThemeMode>(
    () => loadStored().theme ?? DEFAULT.theme,
  );
  const [font, setFontState] = useState<FontFamily>(
    () => loadStored().font ?? DEFAULT.font,
  );
  const [density, setDensityState] = useState<Density>(
    () => loadStored().density ?? DEFAULT.density,
  );

  useEffect(() => {
    applyTheme(theme);
    applyFont(font);
    applyDensity(density);
    persist({ theme, font, density });
  }, [theme, font, density]);

  const setTheme = useCallback((next: ThemeMode): void => setThemeState(next), []);
  const setFont = useCallback((next: FontFamily): void => setFontState(next), []);
  const setDensity = useCallback((next: Density): void => setDensityState(next), []);

  const value = useMemo<AppearanceState>(
    () => ({ theme, font, density, setTheme, setFont, setDensity }),
    [theme, font, density, setTheme, setFont, setDensity],
  );

  return (
    <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
  );
}