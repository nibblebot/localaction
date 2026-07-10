import { Provider } from 'tinybase/ui-react';
import { DataLayerProvider, getStore } from './data/index.ts';
import SelectionProvider from './components/selection.tsx';
import Sidebar from './components/Sidebar.tsx';

import MainPane from './components/MainPane.tsx';
import { Inspector } from 'tinybase/ui-react-inspector';
import './App.css';

const store = getStore();

function App(): React.JSX.Element {
  return (
    <Provider store={store}>
      <DataLayerProvider>
        <SelectionProvider>
          <div className="app-shell">
            <Sidebar />
            <MainPane />
            <Inspector />
          </div>
        </SelectionProvider>
      </DataLayerProvider>
    </Provider>
  );
}

export default App;
