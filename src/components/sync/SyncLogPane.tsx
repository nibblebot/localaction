import { useEffect, useState, useSyncExternalStore } from 'react';
import { getSyncLog, summarizeTables } from '../../data/index.ts';
import type { SyncLogEvent } from '../../data/index.ts';
import EmptyState from '../shared/EmptyState.tsx';
import {
  absoluteTime,
  connectTimeMs,
  connectionChip,
  connectionDescription,
  formatConnectTime,
  KIND_PRESENTATION,
  tableBreakdown,
} from './syncLogFormat.ts';
import { getSyncLogEvents, subscribeSyncLog } from './syncLogStore.ts';

const syncLog = getSyncLog();

const COPIED_MS = 1500;

/**
 * Full sync-log debug viewer (`#/sync-log`): every captured pull /
 * push / sweep / connection event, newest first, with per-table
 * added/updated/removed breakdowns and the raw event JSON under a
 * disclosure. Header actions copy the whole log as JSON or clear it.
 */
export default function SyncLogPane(): React.JSX.Element {
  const events = useSyncExternalStore(subscribeSyncLog, getSyncLogEvents);
  const [copied, setCopied] = useState(false);

  // Transient "Copied" confirmation on the copy button.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);

  async function copyLog(): Promise<void> {
    try {
      await navigator.clipboard.writeText(JSON.stringify(syncLog.events, null, 2));
      setCopied(true);
    } catch {
      // Clipboard unavailable (permissions / non-secure context) — stay quiet.
    }
  }

  if (events.length === 0) {
    return <EmptyState title="Sync log" message="No sync activity yet." ariaLabel="Sync log" />;
  }

  const now = Date.now();
  return (
    <main className="main" aria-label="Sync log">
      <div className="main-body">
        <header className="main-pane-header">
          <h2 className="main-pane-title">Sync log</h2>
          <div className="sync-log-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={copyLog}>
              {copied ? 'Copied' : 'Copy log'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => syncLog.clear()}
            >
              Clear
            </button>
          </div>
        </header>
        <ol className="sync-log-list">
          {[...events].reverse().map((event) => (
            <SyncLogRow events={events} event={event} now={now} key={event.id} />
          ))}
        </ol>
      </div>
    </main>
  );
}

function SyncLogRow({
  events,
  event,
  now,
}: {
  events: readonly SyncLogEvent[];
  event: SyncLogEvent;
  now: number;
}): React.JSX.Element {
  const chip =
    event.kind === 'connection' ? connectionChip(event.status) : KIND_PRESENTATION[event.kind];
  const ttc =
    event.kind === 'connection' && event.status.kind === 'connected'
      ? connectTimeMs(events, event)
      : undefined;
  return (
    <li className="sync-log-event">
      <time className="sync-log-time" dateTime={new Date(event.at).toISOString()}>
        {absoluteTime(event.at, now)}
      </time>
      <span className={`sync-log-chip sync-log-chip-${chip.tone}`}>{chip.label}</span>
      <div className="sync-log-detail">
        {event.kind === 'connection' ? (
          <p className="sync-log-line">
            {connectionDescription(event.status)}
            {ttc === undefined ? '' : ` (${formatConnectTime(ttc)})`}
          </p>
        ) : (
          <>
            <p className="sync-log-line">{summarizeTables(event.tables)}</p>
            {tableBreakdown(event.tables).map((line) => (
              <p className="sync-log-breakdown" key={line}>
                {line}
              </p>
            ))}
            <details className="sync-log-raw">
              <summary>Raw event</summary>
              <pre>{JSON.stringify(event, null, 2)}</pre>
            </details>
          </>
        )}
      </div>
    </li>
  );
}
