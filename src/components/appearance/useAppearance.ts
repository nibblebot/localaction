import { useContext, useEffect, useState } from 'react';
import { AppearanceContext } from './context.ts';
import type { AppearanceState } from './AppearanceProvider.tsx';

export function useAppearance(): AppearanceState {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used inside AppearanceProvider');
  return ctx;
}

/**
 * Returns the resolved theme mode (always 'light' or 'dark') by combining the
 * stored preference with the OS color-scheme media query. Must be called from a
 * component — it subscribes to media-query changes.
 */
export function useResolvedTheme(): 'light' | 'dark' {
  const { theme } = useAppearance();
  const [system, setSystem] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent): void => setSystem(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return theme === 'system' ? system : theme;
}