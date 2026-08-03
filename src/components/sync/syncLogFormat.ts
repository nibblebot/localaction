import type { SyncLogEvent, SyncStatus, SyncTableStats } from '../../data/index.ts';

/**
 * Presentation helpers for the sync-log UI (popover + full viewer).
 * Pure formatters — no React, no store access — so the badge popover
 * and the debug pane render identical wording.
 */

export interface KindPresentation {
  /** Chip label in the full viewer ("Pulled"). */
  label: string;
  /** Modifier for `.sync-log-chip-*` (pull / push / sweep / …). */
  tone: string;
}

export const KIND_PRESENTATION: Record<SyncLogEvent['kind'], KindPresentation> = {
  pull: { label: 'Pulled', tone: 'pull' },
  push: { label: 'Pushed', tone: 'push' },
  sweep: { label: 'Removed', tone: 'sweep' },
  connection: { label: 'Connection', tone: 'connection' },
};

/** Compact badge label — connectivity only; freshness/severity lives in the dot and tooltip. */
export function badgeLabel(status: SyncStatus, hasUnsyncedChanges: boolean): string {
  switch (status.kind) {
    case 'idle':
      return 'Local only';
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return hasUnsyncedChanges ? 'Syncing…' : 'Synced';
    case 'retrying':
    case 'error':
      // Offline states share one quiet label — the dot carries the
      // distinction (grey = synced, blinking orange = unsynced changes,
      // red = reconnect gave up); specifics live in the tooltip.
      return 'Offline';
  }
}

/** Tooltip detail: carries retry/error specifics the compact label drops. */
export function badgeTitle(status: SyncStatus, hasUnsyncedChanges: boolean): string {
  const label = badgeLabel(status, hasUnsyncedChanges);
  switch (status.kind) {
    case 'idle':
    case 'connecting':
      return label;
    case 'connected':
      return label;
    case 'retrying': {
      const base = `retry #${status.attempt} in ${Math.round(status.nextDelayMs / 1000)}s (${status.reason})`;
      return hasUnsyncedChanges
        ? `${label} — ${base} — changes will sync when reconnected`
        : `${label} — ${base}`;
    }
    case 'error':
      return hasUnsyncedChanges
        ? `${label} — ${status.message} — changes will sync when reconnected`
        : `${label} — ${status.message}`;
  }
}

/** Chip label for a connection event, keyed off the status itself. */
export function connectionChip(status: SyncStatus): KindPresentation {
  switch (status.kind) {
    case 'connected':
      return { label: 'Connected', tone: 'connected' };
    case 'connecting':
      return { label: 'Connecting', tone: 'connecting' };
    case 'retrying':
      return { label: 'Retrying', tone: 'retrying' };
    case 'error':
      return { label: 'Error', tone: 'error' };
    case 'idle':
      return { label: 'Disconnected', tone: 'idle' };
  }
}

/** Status line for a connection event ("retry #2 in 10000ms (socket-closed)"). */
export function connectionDescription(status: SyncStatus): string {
  switch (status.kind) {
    case 'connected':
      return 'connected';
    case 'connecting':
      return 'connecting…';
    case 'retrying':
      return `retry #${status.attempt} in ${status.nextDelayMs}ms (${status.reason})`;
    case 'error':
      return `error: ${status.message}`;
    case 'idle':
      return 'disconnected';
  }
}

/** One-line popover row for an event ("Pulled 8 Tasks, 3 Projects"). */
export function eventLine(event: SyncLogEvent, summarize: (tables: SyncTableStats) => string): string {
  switch (event.kind) {
    case 'pull':
      return `Pulled ${summarize(event.tables)}`;
    case 'push':
      return `Pushed ${summarize(event.tables)}`;
    case 'sweep':
      return `Removed ${summarize(event.tables)} after sync`;
    case 'connection':
      switch (event.status.kind) {
        case 'connected':
          return 'Connected';
        case 'connecting':
          return 'Connecting…';
        case 'retrying':
          return `Retry #${event.status.attempt}…`;
        case 'error':
          return 'Sync error';
        case 'idle':
          return 'Disconnected';
      }
  }
}

const TABLE_ORDER = ['tasks', 'projects', 'sections', 'areas', 'notes', 'tombstones'] as const;

/**
 * Per-table added/updated/removed breakdown for the full viewer —
 * only non-zero parts, in the fixed table display order:
 * "tasks: 8 added, 1 updated".
 */
export function tableBreakdown(tables: SyncTableStats): string[] {
  const lines: string[] = [];
  for (const table of TABLE_ORDER) {
    const stat = tables[table];
    if (!stat) continue;
    const parts: string[] = [];
    if (stat.added > 0) parts.push(`${stat.added} added`);
    if (stat.updated > 0) parts.push(`${stat.updated} updated`);
    if (stat.removed > 0) parts.push(`${stat.removed} removed`);
    if (parts.length > 0) lines.push(`${table}: ${parts.join(', ')}`);
  }
  return lines;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Popover relative time: "just now", "2m ago", "1h ago". */
export function relativeTime(at: number, now: number): string {
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE_MS) return 'just now';
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
  return `${Math.floor(elapsed / HOUR_MS)}h ago`;
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

/**
 * Full-viewer timestamp: `HH:MM:SS`, prefixed with the date when the
 * event is not from today ("Aug 1 23:59:59").
 */
export function absoluteTime(at: number, now: number): string {
  const d = new Date(at);
  const time = timeFormatter.format(d);
  const n = new Date(now);
  const sameDay =
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate();
  return sameDay ? time : `${dateFormatter.format(d)} ${time}`;
}
