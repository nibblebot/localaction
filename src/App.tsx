import { Provider } from 'tinybase/ui-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { DataLayerProvider, getStore } from './data/index.ts';
import SelectionProvider from './components/selection.tsx';
import UndoProvider from './components/undo.tsx';
import Sidebar from './components/Sidebar.tsx';
import MainPane from './components/MainPane.tsx';
import { useFocusTrap } from './components/useFocusTrap.ts';
import { AppearanceProvider } from './components/appearance/AppearanceProvider.tsx';
import QuickAddModal from './components/QuickAddModal.tsx';
import './App.css';

// Dev-only TinyBase Inspector: `import.meta.env.DEV` is statically replaced
// by Vite, so the dynamic import (and the whole ui-react-inspector chunk)
// is tree-shaken out of production builds.
const Inspector = import.meta.env.DEV
  ? lazy(() =>
      import('tinybase/ui-react-inspector').then((m) => ({ default: m.Inspector })),
    )
  : null;

const store = getStore();

function App(): React.JSX.Element {
  // Mobile drawer: the sidebar slides in over the main pane below 768px.
  // It closes on navigation (hash change), on any sidebar navigation tap
  // (onNavigate — covers re-tapping the current route, which fires no
  // hashchange), Escape, or backdrop tap.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  // While open the drawer is a modal dialog: focus is contained inside
  // the sidebar and returns to the toggle on close.
  useFocusTrap(sidebarRef, drawerOpen);
  useEffect(() => {
    if (!drawerOpen) return;
    // Move focus into the drawer so keyboard/AT users land in the dialog.
    sidebarRef.current
      ?.querySelector<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])')
      ?.focus();
    const close = (): void => setDrawerOpen(false);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('hashchange', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('hashchange', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen]);
  return (
    <Provider store={store}>
      <AppearanceProvider>
        <DataLayerProvider>
          <SelectionProvider>
            <UndoProvider>
              <div className={`app-shell${drawerOpen ? ' drawer-open' : ''}`}>
                <button
                  type="button"
                  className="drawer-toggle icon-button"
                  aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'}
                  aria-expanded={drawerOpen}
                  aria-controls="app-sidebar"
                  onClick={() => setDrawerOpen((v) => !v)}
                >
                  <svg className="svg-icon" aria-hidden="true">
                    <use href="/icons.svg#menu-icon" />
                  </svg>
                </button>
                <Sidebar
                  ref={sidebarRef}
                  drawerOpen={drawerOpen}
                  onNavigate={() => setDrawerOpen(false)}
                />
                {drawerOpen ? (
                  <div
                    className="drawer-backdrop"
                    onClick={() => setDrawerOpen(false)}
                  />
                ) : null}
                <MainPane />
                {Inspector !== null ? (
                  <Suspense fallback={null}>
                    <Inspector />
                  </Suspense>
                ) : null}
                <QuickAddModal />
              </div>
            </UndoProvider>
          </SelectionProvider>
        </DataLayerProvider>
      </AppearanceProvider>
    </Provider>
  );
}

export default App;
