import { DataLayerProvider, useDataLayer } from './data/index.ts';
import type { SyncStatus } from './data/index.ts';
import './App.css';

function SyncStatusBadge() {
  const { syncStatus } = useDataLayer();
  return (
    <div className={`sync-status sync-status-${syncStatus.kind}`} role="status">
      {labelFor(syncStatus)}
    </div>
  );
}

function labelFor(status: SyncStatus): string {
  switch (status.kind) {
    case 'idle':
      return 'Sync: idle';
    case 'connecting':
      return 'Sync: connecting…';
    case 'connected':
      return 'Sync: connected';
    case 'retrying':
      return `Sync: retry #${status.attempt} in ${Math.round(status.nextDelayMs)}ms (${status.reason})`;
    case 'error':
      return `Sync: error — ${status.message}`;
  }
}

function LeftPane() {
  return (
    <aside className="pane pane-left" aria-label="Tree">
      <header className="pane-header">
        <h2>Tree</h2>
        <p className="pane-subtitle">Domains, projects, and tasks will live here.</p>
      </header>
      <div className="pane-body">
        <p className="placeholder">
          Placeholder. Issue 02 will render the Domain tree via{' '}
          <code>useDomains()</code>.
        </p>
      </div>
    </aside>
  );
}

function RightPane() {
  return (
    <main className="pane pane-right" aria-label="Editor">
      <header className="pane-header">
        <nav className="breadcrumbs" aria-label="Breadcrumbs">
          <span>Home</span>
        </nav>
        <SyncStatusBadge />
      </header>
      <div className="pane-body">
        <p className="placeholder">
          Placeholder. A future issue will render breadcrumbs + the entity
          editor here.
        </p>
      </div>
    </main>
  );
}

function App() {
  return (
    <DataLayerProvider>
      <div className="app-shell">
        <LeftPane />
        <RightPane />
      </div>
    </DataLayerProvider>
  );
}

export default App
