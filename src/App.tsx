import { DataLayerProvider } from './data/index.ts';
import SelectionProvider from './components/selection.tsx';
import Tree from './components/Tree.tsx';
import RightPane from './components/RightPane.tsx';
import './App.css';

function App(): React.JSX.Element {
  return (
    <DataLayerProvider>
      <SelectionProvider>
        <div className="app-shell">
          <Tree />
          <RightPane />
        </div>
      </SelectionProvider>
    </DataLayerProvider>
  );
}

export default App;