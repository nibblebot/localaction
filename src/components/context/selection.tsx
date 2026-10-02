import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { formatRoute, parseRoute, routeEquals } from '../../router.ts';
import type { Selection } from '../../router.ts';
import { SelectionContext } from './selectionContext.ts';

export default function SelectionProvider({ children }: { children: ReactNode }): ReactElement {
  const [selection, setSelection] = useState<Selection>(() =>
    parseRoute(typeof window === 'undefined' ? '' : window.location.hash),
  );

  useEffect(() => {
    const onHashChange = (): void => {
      setSelection(parseRoute(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((sel: Selection): void => {
    const next = formatRoute(sel);
    if (next === window.location.hash) {
      setSelection((prev) => (routeEquals(prev, sel) ? prev : sel));
      return;
    }
    window.location.hash = next;
  }, []);

  const contextValue = useMemo(() => ({ selection, navigate }), [selection, navigate]);
  return <SelectionContext.Provider value={contextValue}>{children}</SelectionContext.Provider>;
}
