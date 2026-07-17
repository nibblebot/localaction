import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { PersonFilterContext, type PersonFilterValue } from './personFilterContextValue.ts';

const STORAGE_KEY = 'localaction.personFilter.v1';

function loadStored(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function persist(ids: readonly string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage may be unavailable (private mode); degrade silently.
  }
}

export default function PersonFilterProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [selected, setSelected] = useState<string[]>(() => loadStored());

  useEffect(() => {
    persist(selected);
  }, [selected]);

  const toggle = useCallback((personId: string): void => {
    setSelected((prev) =>
      prev.includes(personId) ? prev.filter((x) => x !== personId) : [...prev, personId],
    );
  }, []);

  const setFilter = useCallback((ids: readonly string[]): void => {
    setSelected(() => Array.from(new Set(ids)));
  }, []);

  const clear = useCallback((): void => {
    setSelected([]);
  }, []);

  const has = useCallback(
    (personId: string): boolean => selected.includes(personId),
    [selected],
  );

  const value = useMemo<PersonFilterValue>(
    () => ({ selected, active: selected.length > 0, toggle, setFilter, clear, has }),
    [selected, toggle, setFilter, clear, has],
  );

  return (
    <PersonFilterContext.Provider value={value}>
      {children}
    </PersonFilterContext.Provider>
  );
}
