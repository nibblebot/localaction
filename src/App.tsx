import { Provider } from 'tinybase/ui-react';
import { useEffect, useState } from 'react';
import { DataLayerProvider, getStore } from './data/index.ts';
import SelectionProvider from './components/selection.tsx';
import Sidebar from './components/Sidebar.tsx';
import MainPane from './components/MainPane.tsx';
import { Inspector } from 'tinybase/ui-react-inspector';
import { AppearanceProvider } from './components/appearance/AppearanceProvider.tsx';
import AppearanceMenu from './components/appearance/AppearanceMenu.tsx';
import QuickAddModal from './components/QuickAddModal.tsx';
import PersonFilterProvider from './components/persons/PersonFilterContext.tsx';
import './App.css';

const store = getStore();

function App(): React.JSX.Element {
  // Mobile drawer: the sidebar slides in over the main pane below 768px.
  // It closes on navigation (hash change), Escape, or backdrop tap.
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!drawerOpen) return;
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
                <Sidebar />
                {drawerOpen ? (
                  <div
                    className="drawer-backdrop"
                    onClick={() => setDrawerOpen(false)}
                  />
                ) : null}
                <MainPane />
                {import.meta.env.DEV ? <Inspector /> : null}
                <AppearanceMenu />
                <QuickAddModal />
              </div>
            </SelectionProvider>
          </DataLayerProvider>
        </PersonFilterProvider>
      </AppearanceProvider>
    </Provider>
  );
}

export default App;
