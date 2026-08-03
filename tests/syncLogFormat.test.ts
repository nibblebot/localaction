import { describe, expect, it } from 'bun:test';
import { badgeLabel, badgeTitle } from '../src/components/sync/syncLogFormat.ts';
import type { SyncStatus } from '../src/data/index.ts';

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

  it('retrying clean reads "Offline · synced", dirty reads "Offline · unsynced changes"', () => {
    expect(badgeLabel(retrying, false)).toBe('Offline · synced');
    expect(badgeLabel(retrying, true)).toBe('Offline · unsynced changes');
  });

  it('error clean reads "Offline · sync error", dirty reads "Offline · unsynced changes"', () => {
    expect(badgeLabel(error, false)).toBe('Offline · sync error');
    expect(badgeLabel(error, true)).toBe('Offline · unsynced changes');
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
