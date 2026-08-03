import type { CellStamp, MergeableChanges, MergeableStore } from 'tinybase';
import { TABLES } from './schema.ts';
import type { TableName } from './schema.ts';
import type { SyncStatus } from './sync.ts';
import { isReconcileSweepActive } from './deletion.ts';
import { logWarn } from '../log.ts';

/**
 * In-memory sync event log. Lives OUTSIDE the MergeableStore on purpose:
 * writing log rows into the store would sync them back out, and the
 * resulting inbound merge would log again — a sync loop. The log is a
 * plain session-scoped ring buffer; nothing here touches the store.
 */

export interface SyncTableStat {
  added: number;
  updated: number;
  removed: number;
}

export type SyncTableStats = Partial<Record<TableName, SyncTableStat>>;

export type SyncLogEvent =
  | { id: number; at: number; kind: 'pull'; tables: SyncTableStats }
  | { id: number; at: number; kind: 'push'; tables: SyncTableStats }
  | { id: number; at: number; kind: 'sweep'; tables: SyncTableStats }
  | { id: number; at: number; kind: 'connection'; status: SyncStatus };

export interface SyncLog {
  readonly events: readonly SyncLogEvent[]; // oldest → newest, capped
  subscribe(listener: () => void): () => void;
  clear(): void;
}

export interface SyncLogOptions {
  now?: () => number;
  capacity?: number;
}

const DEFAULT_CAPACITY = 500;

// Event payload before the log stamps it with `id`/`at`.
type SyncLogEventInput =
  | { kind: 'pull' | 'push' | 'sweep'; tables: SyncTableStats }
  | { kind: 'connection'; status: SyncStatus };

// Internal back-channel: capture helpers receive the public SyncLog and
// append through this. Not exported — consumers only read.
interface SyncLogRecorder extends SyncLog {
  record(input: SyncLogEventInput): void;
}

function asSyncLogRecorder(log: SyncLog): SyncLogRecorder {
  return log as SyncLogRecorder;
}

export function createSyncLog(options: SyncLogOptions = {}): SyncLog {
  const now = options.now ?? Date.now;
  const capacity = options.capacity ?? DEFAULT_CAPACITY;
  let events: SyncLogEvent[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  // One transaction = one event, always appended — no coalescing. A burst
  // of writes (typing keystrokes) reads as a burst of events; multi-write
  // operations that should read as one change are made atomic at the
  // writer (see setTaskStatus) instead.
  const record = (input: SyncLogEventInput): void => {
    const at = now();
    const id = nextId++;
    const event: SyncLogEvent =
      input.kind === 'connection'
        ? { id, at, kind: 'connection', status: input.status }
        : { id, at, kind: input.kind, tables: input.tables };
    events = [...events, event];
    if (events.length > capacity) {
      events = events.slice(events.length - capacity);
    }
    notify();
  };

  const log: SyncLogRecorder = {
    get events() {
      return events;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      events = [];
      notify();
    },
    record,
  };
  return log;
}

let singleton: SyncLog | undefined;

/**
 * Returns the process-wide singleton SyncLog, creating it on first call.
 * Tests use {@link createSyncLog} for isolated instances.
 */
export function getSyncLog(): SyncLog {
  if (!singleton) {
    singleton = createSyncLog();
  }
  return singleton;
}

export function recordConnectionEvent(log: SyncLog, status: SyncStatus): void {
  const events = log.events;
  const prev = events.length > 0 ? events[events.length - 1] : undefined;
  if (prev?.kind === 'connection' && sameStatus(prev.status, status)) return;
  asSyncLogRecorder(log).record({ kind: 'connection', status });
}

function sameStatus(a: SyncStatus, b: SyncStatus): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'retrying' && b.kind === 'retrying') {
    return (
      a.attempt === b.attempt &&
      a.nextDelayMs === b.nextDelayMs &&
      a.reason === b.reason
    );
  }
  if (a.kind === 'error' && b.kind === 'error') {
    return a.message === b.message;
  }
  return true;
}

// Display names in fixed summary order.
const SUMMARY_ORDER: readonly (readonly [TableName, string, string])[] = [
  [TABLES.tasks, 'Task', 'Tasks'],
  [TABLES.projects, 'Project', 'Projects'],
  [TABLES.sections, 'Section', 'Sections'],
  [TABLES.areas, 'Area', 'Areas'],
  [TABLES.notes, 'Note', 'Notes'],
  [TABLES.tombstones, 'Tombstone', 'Tombstones'],
];

export function summarizeTables(tables: SyncTableStats): string {
  const segments: string[] = [];
  for (const [table, singular, plural] of SUMMARY_ORDER) {
    const stat = tables[table];
    if (!stat) continue;
    const count = stat.added + stat.updated + stat.removed;
    if (count === 0) continue;
    segments.push(`${count} ${count === 1 ? singular : plural}`);
  }
  return segments.length > 0 ? segments.join(', ') : 'No changes';
}

export function totalRows(tables: SyncTableStats): number {
  let total = 0;
  for (const stat of Object.values(tables)) {
    if (stat) total += stat.added + stat.updated + stat.removed;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

// Global gate for push/sweep recording. Off by default so the OPFS load
// transaction and the order backfill never appear in the log; the data
// provider flips it on once local state is ready. Module-level (not per
// store/log) to match the never-destroyed sync client lifecycle. Pull
// capture is NOT gated — the initial sync pull must be logged even before
// persistence finishes.
let pushCaptureEnabled = false;

export function setPushCaptureEnabled(enabled: boolean): void {
  pushCaptureEnabled = enabled;
}

// Subscribers notified with the classified tables of every recorded local
// commit (push or sweep). Module-level, same style as pushCaptureEnabled
// — the consumer (the unsynced tracker) lives outside any store too.
const localCommitListeners = new Set<(tables: SyncTableStats) => void>();

/**
 * Subscribes to local (non-sync-applied) store commits. Fires at the same
 * discrimination point as push/sweep recording: the `applying` gate keeps
 * inbound sync applies out, the OPFS-load gate keeps bootstrap
 * transactions out, and zero-net-row transactions are skipped. Sweep
 * events fire too — tombstone cascades are local writes that must sync.
 */
export function subscribeLocalCommits(
  listener: (tables: SyncTableStats) => void,
): () => void {
  localCommitListeners.add(listener);
  return () => {
    localCommitListeners.delete(listener);
  };
}

type RowClass = 'added' | 'updated' | 'removed';

// Both classifiers walk a transaction's mergeable changes and count rows
// per table by class.

// Unhashed mergeable table stamps nest as
//   changes[0][0] = {[tableId]: [{[rowId]: [{[cellId]: [v|undefined, hlc?]}, hlc?]}, hlc?]}
// A cell stamp value of `undefined` marks a deleted cell; a row whose
// every incoming cell is deleted is a removal.
function rowIsRemoved(cellsMap: Record<string, CellStamp>): boolean {
  return Object.values(cellsMap).every((cellStamp) => cellStamp[0] === undefined);
}

function walkChangeRows(
  changes: MergeableChanges,
  visit: (table: TableName, rowId: string, removed: boolean) => void,
): void {
  const tablesMap = changes?.[0]?.[0];
  if (!tablesMap || typeof tablesMap !== 'object') return;
  for (const tableId of Object.keys(tablesMap) as TableName[]) {
    const rowsMap = tablesMap[tableId]?.[0];
    if (!rowsMap) continue;
    for (const rowId of Object.keys(rowsMap)) {
      const cellsMap = rowsMap[rowId]?.[0];
      if (!cellsMap) continue;
      visit(tableId, rowId, rowIsRemoved(cellsMap));
    }
  }
}

// Pull classification runs against the apply transaction's NET changes
// (captured from the didFinishTransaction listener), with row existence
// snapshotted BEFORE the apply: a row absent pre-apply is `added`, one
// whose net cells are all deletions is `removed`, anything else is
// `updated`. Counting the net — not the incoming body — is what keeps an
// echo re-apply (e.g. the OPFS persister re-pushing loaded content, which
// the server relays back) from double-counting: it merges to zero net
// rows and records nothing.
function snapshotExistingRows(
  store: MergeableStore,
  changes: MergeableChanges,
): Map<TableName, Set<string>> {
  const existing = new Map<TableName, Set<string>>();
  walkChangeRows(changes, (table, rowId) => {
    if (!store.hasRow(table, rowId)) return;
    let rows = existing.get(table);
    if (rows === undefined) {
      rows = new Set();
      existing.set(table, rows);
    }
    rows.add(rowId);
  });
  return existing;
}

function classifyNetPull(
  changes: MergeableChanges,
  existedBefore: Map<TableName, Set<string>>,
): SyncTableStats {
  const stats: SyncTableStats = {};
  walkChangeRows(changes, (table, rowId, removed) => {
    const cls: RowClass = !existedBefore.get(table)?.has(rowId)
      ? 'added'
      : removed
        ? 'removed'
        : 'updated';
    const stat = stats[table] ?? { added: 0, updated: 0, removed: 0 };
    stat[cls] += 1;
    stats[table] = stat;
  });
  return stats;
}

// Push classification runs AFTER the transaction, so it cannot distinguish
// an added row from an updated one (the row exists either way) — pushes
// record only `updated` and `removed`.
function classifyPush(changes: MergeableChanges): SyncTableStats {
  const stats: SyncTableStats = {};
  walkChangeRows(changes, (table, _rowId, removed) => {
    const cls: RowClass = removed ? 'removed' : 'updated';
    const stat = stats[table] ?? { added: 0, updated: 0, removed: 0 };
    stat[cls] += 1;
    stats[table] = stat;
  });
  return stats;
}

// The synchronizer never calls the public `applyMergeableChanges`: inbound
// diffs flow through `setContentOrChanges` (node_modules/tinybase/
// synchronizers/index.js) straight into the store's internal encoded-apply
// slot, `store.__[4]` (node_modules/tinybase/mergeable-store/index.js —
// changes carry `[2] === 1`; full content goes to `__[3]`). That slot is
// the single synchronous funnel for every sync-applied diff — the initial
// hash drill-down fragments and live ContentDiff updates alike — so
// wrapping it captures every pull. OPFS/persister loads never touch it.
// Pulls are counted from the apply transaction's NET changes (see
// classifyNetPull), not the incoming body, so echo/re-applies — which
// merge to zero net rows — never double-count.
// The public type hides `__`; narrow it at runtime (version-drift guard).
function internalApplySlot(store: MergeableStore): {
  slots: unknown[];
  original: (changes: MergeableChanges) => unknown;
} | undefined {
  if (!('__' in store)) return undefined;
  const slots: unknown = store.__;
  if (!Array.isArray(slots)) return undefined;
  const slot: unknown = slots[4];
  if (typeof slot !== 'function') return undefined;
  return { slots, original: slot as (changes: MergeableChanges) => unknown };
}

const captured = new WeakSet<MergeableStore>();

/**
 * Idempotently attaches sync capture to a store. Inbound merges are logged
 * as `pull` events by wrapping the store's internal apply slot (see above);
 * local commits are logged as `push` (or `sweep` while the tombstone
 * reconciler runs) via a post-transaction listener. Capture only READS the
 * store — no writes, so logging can never feed back into sync. Returns an
 * uninstaller; safe to call again for the same store (no-ops).
 */
export function installSyncLogCapture(store: MergeableStore, log: SyncLog): () => void {
  if (captured.has(store)) return () => {};
  captured.add(store);
  const recorder = asSyncLogRecorder(log);

  // Set while an inbound diff is being applied: didFinishTransaction fires
  // synchronously INSIDE the apply, where it stashes the transaction's net
  // changes as `pendingPull` (instead of misclassifying them as a push).
  // The wrapper records the pull from that stash once the apply returns.
  let applying = false;
  let pendingPull: MergeableChanges | undefined;

  const internal = internalApplySlot(store);
  if (internal === undefined) {
    // TinyBase internals drifted — degrade to push-only capture rather
    // than breaking sync itself.
    logWarn('sync-log', 'internal apply slot missing; pull capture disabled');
  } else {
    const { slots, original } = internal;
    slots[4] = (changes: MergeableChanges): unknown => {
      // Snapshot existence for body-named rows BEFORE applying — net
      // changes are a subset of the body, so this covers every row the
      // pull event can name.
      const existedBefore = snapshotExistingRows(store, changes);
      applying = true;
      try {
        return original(changes);
      } finally {
        applying = false;
        const net = pendingPull;
        pendingPull = undefined;
        if (net !== undefined) {
          const tables = classifyNetPull(net, existedBefore);
          if (totalRows(tables) > 0) {
            recorder.record({ kind: 'pull', tables });
          }
        }
      }
    };
  }

  const listenerId = store.addDidFinishTransactionListener(() => {
    if (applying) {
      // Inbound apply — stash the NET changes for the wrapper. An echo
      // re-apply nets zero rows here, so it can never be double-logged.
      pendingPull = store.getTransactionMergeableChanges();
      return;
    }
    if (!pushCaptureEnabled) return;
    const tables = classifyPush(store.getTransactionMergeableChanges());
    if (totalRows(tables) === 0) return;
    recorder.record({
      kind: isReconcileSweepActive() ? 'sweep' : 'push',
      tables,
    });
    // Local-commit subscribers (the unsynced tracker) fire here and only
    // here: after the `applying` gate (inbound applies excluded), after
    // the push gate (bootstrap excluded), after the zero-row early-return.
    for (const listener of localCommitListeners) listener(tables);
  });

  return () => {
    store.delListener(listenerId);
    if (internal !== undefined) {
      internal.slots[4] = internal.original;
    }
    captured.delete(store);
  };
}
