import { Provider } from 'tinybase/ui-react';
import { useEffect, useRef, useState } from 'react';
import { DataLayerProvider, getStore } from './data/index.ts';
import SelectionProvider from './components/selection.tsx';
import UndoProvider from './components/undo.tsx';
import Sidebar from './components/Sidebar.tsx';
import MainPane from './components/MainPane.tsx';
import { useFocusTrap } from './components/useFocusTrap.ts';
import { Inspector } from 'tinybase/ui-react-inspector';
import { AppearanceProvider } from './components/appearance/AppearanceProvider.tsx';
import QuickAddModal from './components/QuickAddModal.tsx';
import PersonFilterProvider from './components/persons/PersonFilterContext.tsx';
import './App.css';

const store = getStore();

function App(): React.JSX.Element {
  // Mobile drawer: the sidebar slides in over the main pane below 768px.
  // It closes on navigation (hash change), Escape, or backdrop tap.
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
        <PersonFilterProvider>
          <DataLayerProvider>
            <SelectionProvider>
              <UndoProvider>
                <div className={`app-shell${drawerOpen ? ' drawer-open' : ''}`}>
                  <button
                    type="button"
                    className="drawer-toggle"
                    aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'}
                    aria-expanded={drawerOpen}
                    aria-controls="app-sidebar"
                    onClick={() => setDrawerOpen((v) => !v)}
                  >
                    <svg className="svg-icon" aria-hidden="true">
                      <use href="/icons.svg#menu-icon" />
                    </svg>
                  </button>
                  <Sidebar ref={sidebarRef} drawerOpen={drawerOpen} />
                  {drawerOpen ? (
                    <div
                      className="drawer-backdrop"
                      onClick={() => setDrawerOpen(false)}
                    />
                  ) : null}
                  <MainPane />
                  {import.meta.env.DEV ? <Inspector /> : null}
                  <QuickAddModal />
                </div>
              </UndoProvider>
            </SelectionProvider>
          </DataLayerProvider>
        </PersonFilterProvider>
      </AppearanceProvider>
    </Provider>
  );
}

export default App;
