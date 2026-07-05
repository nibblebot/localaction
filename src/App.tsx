import { DataLayerProvider } from './data/index.ts';
import SelectionProvider from './components/selection.tsx';
import Tree from './components/Tree.tsx';
import RightPane from './components/RightPane.tsx';
import './App.css';
import { Inspector } from 'tinybase/ui-react-inspector';
import { Provider } from 'tinybase/ui-react';

import { getStore } from './data/store.ts';

const store = getStore()

function App(): React.JSX.Element {
  return (
    <Provider store={store}>
      <DataLayerProvider>
        <SelectionProvider>
          <div className="app-shell">
            <Tree />
            <RightPane />
            <Inspector />
          </div>
        </SelectionProvider>
      </DataLayerProvider>
    </Provider>
  );
}

export default App;
