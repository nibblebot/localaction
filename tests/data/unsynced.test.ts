/**
 * Unsynced-tracker tests: the offline/unsynced state machine surfaced to
 * the sync-status badge via DataLayerValue.hasUnsyncedChanges. Dirty is
 * set by local commits while disconnected and cleared only by the status
 * transition into `connected`.
 */
import { describe, expect, it } from 'bun:test';
import { createUnsyncedTracker } from '../../src/data/unsynced.ts';

describe('unsynced tracker', () => {
  it('starts clean', () => {
    const tracker = createUnsyncedTracker();
    expect(tracker.hasUnsyncedChanges).toBe(false);
  });

  it('does not re-notify on repeated disconnected commits', () => {
    const tracker = createUnsyncedTracker();
    let notified = 0;
    tracker.subscribe(() => {
      notified += 1;
    });
    tracker.noteLocalCommit(false);
    tracker.noteLocalCommit(false);
    expect(tracker.hasUnsyncedChanges).toBe(true);
    expect(notified).toBe(1);
  });

  it('a connected commit never sets dirty and never clears existing dirty', () => {
    const tracker = createUnsyncedTracker();
    // Clean + connected commit: sent synchronously, stays clean.
    tracker.noteLocalCommit(true);
    expect(tracker.hasUnsyncedChanges).toBe(false);

    // Dirty from earlier offline commits is cleared only by the status
    // transition to connected — a connected commit must not touch it.
    tracker.noteLocalCommit(false);
    expect(tracker.hasUnsyncedChanges).toBe(true);
    let notified = 0;
    tracker.subscribe(() => {
      notified += 1;
    });
    tracker.noteLocalCommit(true);
    expect(tracker.hasUnsyncedChanges).toBe(true);
    expect(notified).toBe(0);
  });

  it('clears dirty on transition into connected and notifies', () => {
    const tracker = createUnsyncedTracker();
    tracker.noteLocalCommit(false);
    let notified = 0;
    tracker.subscribe(() => {
      notified += 1;
    });
    tracker.noteStatus({ kind: 'connected' });
    expect(tracker.hasUnsyncedChanges).toBe(false);
    expect(notified).toBe(1);

    // The full flow: dirty offline → connected clears → a subsequent
    // connected commit stays clean.
    tracker.noteLocalCommit(true);
    expect(tracker.hasUnsyncedChanges).toBe(false);
    expect(notified).toBe(1);

    // Already clean: a repeated connected status does not re-notify.
    tracker.noteStatus({ kind: 'connected' });
    expect(notified).toBe(1);
  });

  it('non-connected statuses never clear dirty', () => {
    const tracker = createUnsyncedTracker();
    tracker.noteLocalCommit(false);
    let notified = 0;
    tracker.subscribe(() => {
      notified += 1;
    });
    tracker.noteStatus({ kind: 'connecting' });
    tracker.noteStatus({ kind: 'idle' });
    tracker.noteStatus({
      kind: 'retrying',
      attempt: 1,
      nextDelayMs: 1_000,
      reason: 'closed',
    });
    tracker.noteStatus({ kind: 'error', message: 'gave up' });
    expect(tracker.hasUnsyncedChanges).toBe(true);
    expect(notified).toBe(0);
  });

  it('unsubscribe stops notifications', () => {
    const tracker = createUnsyncedTracker();
    let notified = 0;
    const unsubscribe = tracker.subscribe(() => {
      notified += 1;
    });
    tracker.noteLocalCommit(false);
    expect(notified).toBe(1);
    unsubscribe();
    tracker.noteStatus({ kind: 'connected' });
    expect(tracker.hasUnsyncedChanges).toBe(false);
    expect(notified).toBe(1);
  });
});
