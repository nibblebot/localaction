import { Provider } from 'tinybase/ui-react';
import { DataLayerProvider, getStore } from './data/index.ts';
import SelectionProvider from './components/selection.tsx';
import Sidebar from './components/Sidebar.tsx';
import MainPane from './components/MainPane.tsx';
import { Inspector } from 'tinybase/ui-react-inspector';
import { AppearanceProvider } from './components/appearance/AppearanceProvider.tsx';
import AppearanceMenu from './components/appearance/AppearanceMenu.tsx';
import PersonFilterProvider from './components/persons/PersonFilterContext.tsx';
import './App.css';

const store = getStore();

function App(): React.JSX.Element {
  return (
    <Provider store={store}>
      <AppearanceProvider>
        <PersonFilterProvider>
          <DataLayerProvider>
            <SelectionProvider>
              <div className="app-shell">
                <Sidebar />
                <MainPane />
                <Inspector />
                <AppearanceMenu />
              </div>
            </SelectionProvider>
          </DataLayerProvider>
        </PersonFilterProvider>
      </AppearanceProvider>
    </Provider>
  );
}

export default App;
