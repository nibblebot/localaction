import { describe, expect, it } from 'bun:test';
import {
  badgeLabel,
  badgeTitle,
  compactPopoverRows,
  connectTimeMs,
  formatConnectTime,
} from '../src/components/sync/syncLogFormat.ts';
import type { SyncLogEvent, SyncStatus } from '../src/data/index.ts';

const idle: SyncStatus = { kind: 'idle' };
const connecting: SyncStatus = { kind: 'connecting' };
const connected: SyncStatus = { kind: 'connected' };
const retrying: SyncStatus = {
  kind: 'retrying',
  attempt: 2,
  nextDelayMs: 10_000,
  reason: 'socket-closed',
};
const error: SyncStatus = { kind: 'error', message: 'server unreachable' };

describe('badgeLabel', () => {
  it('idle reads "Local only" regardless of dirty', () => {
    expect(badgeLabel(idle, false)).toBe('Local only');
    expect(badgeLabel(idle, true)).toBe('Local only');
  });

  it('connecting reads "Connecting…" regardless of dirty', () => {
    expect(badgeLabel(connecting, false)).toBe('Connecting…');
    expect(badgeLabel(connecting, true)).toBe('Connecting…');
  });

  it('connected clean reads "Synced", dirty reads "Syncing…"', () => {
    expect(badgeLabel(connected, false)).toBe('Synced');
    expect(badgeLabel(connected, true)).toBe('Syncing…');
  });

  it('retrying reads "Offline" regardless of dirty (dot shows the state)', () => {
    expect(badgeLabel(retrying, false)).toBe('Offline');
    expect(badgeLabel(retrying, true)).toBe('Offline');
  });

  it('error reads "Offline" regardless of dirty (dot shows the state)', () => {
    expect(badgeLabel(error, false)).toBe('Offline');
    expect(badgeLabel(error, true)).toBe('Offline');
  });
});

describe('badgeTitle', () => {
  it('retrying includes attempt number and rounded seconds', () => {
    const title = badgeTitle(retrying, false);
    expect(title).toContain('retry #2');
    expect(title).toContain('in 10s');
    expect(title).toContain('(socket-closed)');
  });

  it('retrying rounds sub-second delays to whole seconds', () => {
    const soon: SyncStatus = {
      kind: 'retrying',
      attempt: 1,
      nextDelayMs: 1499,
      reason: 'socket-closed',
    };
    expect(badgeTitle(soon, false)).toContain('in 1s');
  });

  it('error title uses the status message', () => {
    expect(badgeTitle(error, false)).toContain('server unreachable');
  });

  it('dirty retrying notes changes will sync when reconnected', () => {
    expect(badgeTitle(retrying, true)).toContain('changes will sync when reconnected');
  });

  it('dirty error notes changes will sync when reconnected', () => {
    expect(badgeTitle(error, true)).toContain('changes will sync when reconnected');
  });

  it('clean connected/idle/connecting titles equal the label', () => {
    expect(badgeTitle(connected, false)).toBe('Synced');
    expect(badgeTitle(idle, false)).toBe('Local only');
    expect(badgeTitle(connecting, false)).toBe('Connecting…');
  });
});

// Event builders for compaction tests (ids/timestamps explicit per test).
const conn = (id: number, at: number, status: SyncStatus): SyncLogEvent => ({
  id,
  at,
  kind: 'connection',
  status,
});
const pull = (id: number, at: number): SyncLogEvent => ({
  id,
  at,
  kind: 'pull',
  tables: { tasks: { added: 3, updated: 0, removed: 0 } },
});
const retry1: SyncStatus = {
  kind: 'retrying',
  attempt: 1,
  nextDelayMs: 5_000,
  reason: 'socket-closed',
};
const summarize = (): string => '3 Tasks';

describe('compactPopoverRows', () => {
  it('returns no rows for an empty log', () => {
    expect(compactPopoverRows([], summarize)).toEqual([]);
  });

  it('passes non-connection events through untouched', () => {
    const p = pull(1, 1000);
    expect(compactPopoverRows([p], summarize)).toEqual([
      { id: 1, at: 1000, line: 'Pulled 3 Tasks' },
    ]);
  });

  it('passes standalone idle through untouched', () => {
    expect(compactPopoverRows([conn(1, 1000, idle)], summarize)).toEqual([
      { id: 1, at: 1000, line: 'Disconnected' },
    ]);
  });

  it('collapses a plain connect to "Connected 1.0s"', () => {
    const events = [conn(1, 1000, connecting), conn(2, 2000, connected)];
    expect(compactPopoverRows(events, summarize)).toEqual([
      { id: 2, at: 2000, line: 'Connected 1.0s' },
    ]);
  });

  it('collapses a retry storm into "Reconnected after N retries (TTC)"', () => {
    const events = [
      conn(1, 1000, connecting),
      conn(2, 2000, retry1),
      conn(3, 3000, connecting),
      conn(4, 4000, retrying), // attempt 2
      conn(5, 5000, connecting),
      conn(6, 6000, connected),
    ];
    expect(compactPopoverRows(events, summarize)).toEqual([
      { id: 6, at: 6000, line: 'Reconnected after 2 retries (1.0s)' },
    ]);
  });

  it('uses the retry attempt number even when the run is cut short', () => {
    const events = [conn(1, 1000, retrying), conn(2, 2000, connecting), conn(3, 3000, connected)];
    expect(compactPopoverRows(events, summarize)).toEqual([
      { id: 3, at: 3000, line: 'Reconnected after 2 retries (1.0s)' },
    ]);
  });

  it('renders a single retry as "Reconnected after 1 retry (2.0s)"', () => {
    const events = [conn(1, 1000, connecting), conn(2, 2000, retry1), conn(3, 3000, connected)];
    expect(compactPopoverRows(events, summarize)).toEqual([
      { id: 3, at: 3000, line: 'Reconnected after 1 retry (2.0s)' },
    ]);
  });

  it('keeps separate episodes apart (the screenshot shape)', () => {
    const events = [
      conn(1, 1000, connecting),
      conn(2, 2000, connected),
      conn(3, 3000, retry1),
      conn(4, 4000, connecting),
      conn(5, 5000, retrying),
      conn(6, 6000, connecting),
      conn(7, 7000, connected),
    ];
    expect(compactPopoverRows(events, summarize)).toEqual([
      { id: 2, at: 2000, line: 'Connected 1.0s' },
      { id: 7, at: 7000, line: 'Reconnected after 2 retries (1.0s)' },
    ]);
  });

  it('shows sub-second connect times in milliseconds', () => {
    const events = [conn(1, 1000, connecting), conn(2, 1234, connected)];
    expect(compactPopoverRows(events, summarize)).toEqual([
      { id: 2, at: 1234, line: 'Connected 234ms' },
    ]);
  });

  it('omits the connect time when the attempt start is unknown', () => {
    expect(compactPopoverRows([conn(1, 1000, connected)], summarize)).toEqual([
      { id: 1, at: 1000, line: 'Connected' },
    ]);
  });

  it('collapses an open episode to its latest status line', () => {
    const midFlight = [conn(1, 1000, connecting), conn(2, 2000, retry1), conn(3, 3000, connecting)];
    expect(compactPopoverRows(midFlight, summarize)).toEqual([
      { id: 3, at: 3000, line: 'Connecting…' },
    ]);
    const waiting = [conn(1, 1000, connecting), conn(2, 2000, retry1)];
    expect(compactPopoverRows(waiting, summarize)).toEqual([
      { id: 2, at: 2000, line: 'Retry #1…' },
    ]);
  });

  it('swallows a retry run into a single "Sync error" row', () => {
    const events = [
      conn(1, 1000, connecting),
      conn(2, 2000, retry1),
      conn(3, 3000, connecting),
      conn(4, 4000, error),
    ];
    expect(compactPopoverRows(events, summarize)).toEqual([
      { id: 4, at: 4000, line: 'Sync error' },
    ]);
  });

  it('keeps a standalone error as its own row', () => {
    expect(compactPopoverRows([conn(1, 1000, error)], summarize)).toEqual([
      { id: 1, at: 1000, line: 'Sync error' },
    ]);
  });

  it('a non-connection event closes an open episode', () => {
    const events = [conn(1, 1000, connecting), conn(2, 2000, connected), pull(3, 3000)];
    expect(compactPopoverRows(events, summarize)).toEqual([
      { id: 2, at: 2000, line: 'Connected 1.0s' },
      { id: 3, at: 3000, line: 'Pulled 3 Tasks' },
    ]);
  });
});

describe('formatConnectTime', () => {
  it('uses milliseconds under a second', () => {
    expect(formatConnectTime(234)).toBe('234ms');
    expect(formatConnectTime(999)).toBe('999ms');
    expect(formatConnectTime(0)).toBe('0ms');
  });

  it('uses seconds with one decimal at a second and above', () => {
    expect(formatConnectTime(1000)).toBe('1.0s');
    expect(formatConnectTime(1200)).toBe('1.2s');
    expect(formatConnectTime(25_000)).toBe('25.0s');
  });
});

describe('connectTimeMs', () => {
  it('measures from the nearest preceding connecting event', () => {
    const events = [conn(1, 1000, connecting), conn(2, 2200, connected)];
    expect(connectTimeMs(events, events[1])).toBe(1200);
  });

  it('skips retrying events to find the successful attempt start', () => {
    const events = [
      conn(1, 1000, connecting),
      conn(2, 2000, retry1),
      conn(3, 3000, connecting),
      conn(4, 4000, retrying),
      conn(5, 5000, connecting),
      conn(6, 6200, connected),
    ];
    expect(connectTimeMs(events, events[5])).toBe(1200);
  });

  it('does not cross an earlier episode boundary', () => {
    const events = [
      conn(1, 1000, connecting),
      conn(2, 2000, connected),
      conn(3, 3000, connecting),
      conn(4, 4200, connected),
    ];
    expect(connectTimeMs(events, events[3])).toBe(1200);
  });

  it('stops at an error boundary', () => {
    const events = [
      conn(1, 1000, connecting),
      conn(2, 2000, error),
      conn(3, 3200, connected),
    ];
    expect(connectTimeMs(events, events[2])).toBeUndefined();
  });

  it('ignores non-connection events while scanning', () => {
    const events = [conn(1, 1000, connecting), pull(2, 1500), conn(3, 2200, connected)];
    expect(connectTimeMs(events, events[2])).toBe(1200);
  });

  it('returns undefined for non-connected events and bare logs', () => {
    expect(connectTimeMs([conn(1, 1000, connecting)], conn(9, 9000, error))).toBeUndefined();
    expect(connectTimeMs([conn(1, 1000, connected)], conn(1, 1000, connected))).toBeUndefined();
  });
});
